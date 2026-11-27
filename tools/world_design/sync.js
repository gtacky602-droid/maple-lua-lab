'use strict';

const WorldSync = (() => {
  const schema = 'maple-world-editor-snapshot/1';
  const proposalSchema = 'field_studio_visual_edits_v4';
  const editable = {
    field: ['name', 'lv', 'role', 'terrain'],
    spawn: ['lv', 'count'],
    edge: ['mode', 'note'],
    plan: ['level', 'count']
  };
  const collections = { field: 'fields', spawn: 'spawns', edge: 'edges' };
  const limits = {
    name: v => typeof v === 'string' && v.trim().length > 0 && v.length <= 300,
    terrain: v => typeof v === 'string' && v.length <= 2000,
    role: v => ['hunt', 'field', 'town', 'hold', 'checkpoint', 'safe_connector', 'safe', 'special'].includes(v),
    lv: v => v === null || (Number.isInteger(v) && v >= 1 && v <= 200),
    level: v => Number.isInteger(v) && v >= 1 && v <= 200,
    count: v => Number.isInteger(v) && v >= 1 && v <= 1000,
    mode: v => typeof v === 'string' && /^[a-z_]{1,60}$/.test(v),
    note: v => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000
  };
  const index = rows => new Map(rows.map(row => [row.id, row]));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function same(left, right) {
    if (left === right) return true;
    if (Array.isArray(left) && Array.isArray(right))
      return left.length === right.length && left.every((value, i) => same(value, right[i]));
    return object(left) && object(right) && Object.keys(left).length === Object.keys(right).length
      && Object.keys(left).every(key => Object.hasOwn(right, key) && same(left[key], right[key]));
  }

  function validSnapshot(value, anchor, placementRows = [], knownMonster = () => true) {
    if (value?.schema !== schema || !Number.isSafeInteger(value.editor_revision) || value.editor_revision < 0
        || !object(value.data) || !Array.isArray(value.history) || value.history.length !== value.editor_revision
        || !object(value.placement_overrides ?? {})) return false;
    const data = value.data;
    if (!same(Object.keys(data).sort(), Object.keys(anchor).sort())) return false;
    if (!Object.keys(anchor).filter(key => !Object.values(collections).includes(key))
        .every(key => same(data[key], anchor[key]))) return false;

    const replay = buildState({ data: anchor }, placementRows);
    const overrides = {};
    for (const [i, row] of value.history.entries()) {
      if (row?.revision !== i + 1 || !Number.isFinite(Date.parse(row.sites_reviewed_at))) return false;
      if (row.route_adoption && (!Array.isArray(row.operations) || row.operations.some(op => !/^edge_(add|edit|delete)$/.test(op?.type))))
        return false;
      const comparison = compareOperations(row.operations, replay, {
        protectDeletion: true, allowEdgeDeletion: row.route_adoption === true, knownMonster
      });
      if (comparison.conflicts.length || !comparison.applicable.length || comparison.alreadyPresent.length) return false;
      applyOperations(comparison.applicable, replay);
      for (const op of comparison.applicable.filter(op => op.type === 'plan_edit')) {
        const { level, count } = replay.plan.get(op.id);
        overrides[op.id] = { level, count };
      }
    }
    return Object.entries(collections).every(([kind, key]) => same(data[key], [...replay[kind].values()]))
      && same(value.placement_overrides ?? {}, overrides);
  }

  function buildState(snapshot, placementRows = []) {
    const maps = Object.fromEntries(Object.entries(collections).map(([kind, key]) =>
      [kind, index(structuredClone(snapshot.data[key]))]));
    maps.plan = index(placementRows.map(row => ({ ...row, ...(snapshot.placement_overrides?.[row.id] || {}) })));
    return maps;
  }

  function compareOperations(operations, state, { protectDeletion = false, allowEdgeDeletion = false, knownMonster = () => true } = {}) {
    const conflicts = [], applicable = [], alreadyPresent = [];
    if (!Array.isArray(operations) || operations.length > 10000)
      return { conflicts: [{ reason: 'invalid_operations' }], applicable, alreadyPresent };
    const seen = new Set();
    const validRemovals = new Set();
    if (!protectDeletion || allowEdgeDeletion) {
      for (const op of operations) {
        if (op?.type === 'edge_delete' && object(op.before) && same(state.edge.get(op.id), op.before))
          validRemovals.add(op.id);
      }
    }
    const edgePairs = new Map([...state.edge.values()]
      .filter(edge => !validRemovals.has(edge.id)).map(edge => [pair(edge), edge]));
    for (const op of operations) {
      const [kind, action] = op?.type === 'field' ? ['field', 'edit'] : String(op?.type || '').split('_');
      const id = op?.id ?? op?.data?.id;
      const current = Object.hasOwn(editable, kind) && state[kind].get(id);
      const conflict = (reason, extra = {}) => conflicts.push({ id, type: op?.type, reason, ...extra });
      if (!Object.hasOwn(editable, kind) || typeof id !== 'string' || !id || seen.has(kind + ':' + id)) {
        conflict('invalid_or_duplicate_operation'); continue;
      }
      seen.add(kind + ':' + id);
      if (action === 'edit' && op.type === (kind === 'field' ? 'field' : kind + '_edit')) {
        if (!current || !object(op.changes) || !Object.keys(op.changes).length) {
          conflict('missing_or_invalid_record', { incoming: op?.changes }); continue;
        }
        const remaining = {};
        const conflictCount = conflicts.length;
        for (const [key, change] of Object.entries(op.changes)) {
          if (!editable[kind].includes(key) || !object(change) || !Object.hasOwn(change, 'before') || !limits[key](change.after) || (kind === 'plan' && key === 'count' && change.after > 200)) {
            conflict('invalid_edit', { key, incoming: change }); continue;
          }
          if (same(current[key], change.after)) continue;
          if (same(current[key], change.before)) remaining[key] = change;
          else conflict('value_changed', { key, ...change, current: current[key] });
        }
        if (Object.keys(remaining).length) applicable.push({ ...op, changes: remaining });
        else if (conflicts.length === conflictCount) alreadyPresent.push({ type: op.type, id });
        continue;
      }
      if (!['edge', 'spawn'].includes(kind) || op.type !== kind + '_' + action) {
        conflict('invalid_operation'); continue;
      }
      if (action === 'add') {
        const data = op.data;
        const valid = object(data) && data.id === id && (kind === 'edge'
          ? data.source === 'sites-draft' && id === 'SITE-EDGE:' + [data.a, data.b].sort().join(':')
            && state.field.has(data.a) && state.field.has(data.b) && data.a !== data.b
            && limits.mode(data.mode) && limits.note(data.note) && data.status === 'proposed'
          : validSpawn(data, id) && state.field.has(data.field) && knownMonster(data.monster)
            && limits.lv(data.lv) && limits.count(data.count));
        if (!valid) { conflict('invalid_new_record', { incoming: data }); continue; }
        if (same(current, data)) { alreadyPresent.push({ type: op.type, id }); continue; }
        const samePair = kind === 'edge' && edgePairs.get(pair(data));
        if (current || samePair) { conflict('existing_record', { current: current || samePair, incoming: data }); continue; }
        if (kind === 'edge') edgePairs.set(pair(data), data);
        applicable.push(op);
      } else if (action === 'delete') {
        if (protectDeletion && !(kind === 'edge' && allowEdgeDeletion)) {
          conflict('deletion_requires_separate_review', { current, incoming: op.before }); continue;
        }
        if (!current && object(op.before)) { alreadyPresent.push({ type: op.type, id }); continue; }
        if (!object(op.before) || !same(current, op.before)) {
          conflict('delete_record_changed', { current, before: op.before }); continue;
        }
        applicable.push(op);
      } else conflict('invalid_operation');
    }
    return { conflicts, applicable, alreadyPresent };
  }

  function validSpawn(data, id) {
    const key = data.field + ':' + data.monster;
    if (id === 'SITE-SPAWN:' + key) return data.source === 'sites-draft';
    const evidence = data.evidence;
    return id === 'SITE-RESEARCH:' + key && data.source === 'official_research_design_adoption'
      && evidence?.assignment === 'user_selected_design_proposal'
      && ['map_id', 'point_id', 'label_id'].every(item => Number.isInteger(evidence[item]));
  }

  function pair(edge) { return [edge.a, edge.b].sort().join('|'); }

  function applyOperations(operations, state) {
    for (const op of operations) {
      const [kind, action] = op.type === 'field' ? ['field', 'edit'] : op.type.split('_');
      const rows = state[kind];
      if (action === 'delete') rows.delete(op.id);
      else if (action === 'add') rows.set(op.data.id, structuredClone(op.data));
      else {
        const row = rows.get(op.id);
        for (const [key, { after }] of Object.entries(op.changes)) row[key] = after;
      }
    }
  }

  return { schema, proposalSchema, same, validSnapshot, buildState, compareOperations, applyOperations, collections };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = WorldSync;
