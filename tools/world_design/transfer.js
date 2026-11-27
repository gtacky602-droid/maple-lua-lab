'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const sync = require('./sync.js');
const { inspectRoutes } = require('./inspect_routes.js');

const root = path.resolve(__dirname, '../..');
const world = path.join(root, 'design/world');
const snapshotPath = path.join(world, 'editor-snapshot.json');
const read = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const snapshot = read(snapshotPath);
const master = read(path.join(world, 'monster-catalog.json'));
const species = new Set([...snapshot.data.monsters, ...master.additions].map(row => row.id));
const placementFiles = fs.readdirSync(path.join(world, 'placements')).filter(name => name.endsWith('.json'));
const plans = placementFiles.flatMap(name => read(path.join(world, 'placements', name)).fields);
const rows = plans.flatMap(plan => [...plan.regular_spawns, ...plan.optional_pockets]);
const current = sync.buildState(snapshot, rows);
const usage = 'node tools/world_design/transfer.js export FILE | check PROPOSAL | routes PROPOSAL | apply PROPOSAL';

function output(data, filename) {
  const {data: design, ...metadata} = data;
  const lines = Object.entries(design).map(([key, value]) => {
    let encoded = JSON.stringify(value);
    if (Array.isArray(value) && value.length > 20) {
      encoded = '[\n' + value.map(row => '      ' + JSON.stringify(row)).join(',\n') + '\n    ]';
    }
    return '    ' + JSON.stringify(key) + ': ' + encoded;
  });
  const serialized = JSON.stringify(metadata, null, 2).slice(0, -2) + ',\n  "data": {\n'
    + lines.join(',\n') + '\n  }\n}\n';
  const temporary = filename + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, serialized, { flag: 'wx' });
  fs.renameSync(temporary, filename);
}

function validatePlacement(state, edited) {
  const limits = new Map(read(path.join(world, 'regions.json')).regions.map(r => [r.id, r]));
  const conflicts = [];
  for (const plan of plans) {
    const regular = plan.regular_spawns.map(row => state.plan.get(row.id));
    const changed = regular.filter(row => edited.has(row.id));
    const range = limits.get(plan.design_region_id);
    for (const row of changed) {
      if (row.level < range.low || row.level > range.high)
        conflicts.push({ id: row.id, field_id: plan.field_id, reason: 'outside_region_level_band', current: row.level,
          minimum: range.low, maximum: range.high });
    }
    if (changed.length && regular.reduce((sum, row) => sum + row.count, 0) > plan.stage_layout.max_simultaneous_hostile)
      conflicts.push({ field_id: plan.field_id, reason: 'stage_hostile_cap_exceeded',
        maximum: plan.stage_layout.max_simultaneous_hostile });
  }
  return conflicts;
}

function run() {
  const [command, filename, ...extra] = process.argv.slice(2);
  if (!filename || extra.length || !['export', 'check', 'routes', 'apply'].includes(command)) throw Error(usage);
  const projectBlob = execFileSync('git', ['hash-object', 'design/field-editor/project.json'], {
    cwd: root, encoding: 'utf8'
  }).trim();
  if (projectBlob !== snapshot.data.canonical_sha)
    throw Error('GitHub field-editor/project.json changed. Compare it with the Sites snapshot before syncing.');
  if (command === 'export') {
    if (fs.existsSync(filename)) throw Error('Export destination already exists.');
    output(snapshot, filename);
    return;
  }
  const proposal = read(filename);
  if (proposal.schema !== sync.proposalSchema) throw Error('Unsupported proposal schema.');
  const baseMatches = proposal.base_revision_snapshot === snapshot.data.revision_snapshot
    && proposal.base_project_blob_sha === snapshot.data.canonical_sha
    && (proposal.base_editor_revision ?? 0) === snapshot.editor_revision;
  const compared = sync.compareOperations(proposal.operations, current, {
    protectDeletion: command !== 'routes', knownMonster: id => species.has(id)
  });
  const { applicable, alreadyPresent, conflicts } = compared;
  if (!baseMatches)
    conflicts.unshift({ reason: 'stale_base', current_editor_revision: snapshot.editor_revision,
      proposed_editor_revision: proposal.base_editor_revision ?? 0 });
  const reviewed = proposal.review_status === 'reviewed_proposal'
    && typeof proposal.reviewed_at === 'string' && Number.isFinite(Date.parse(proposal.reviewed_at));
  if (command === 'routes') {
    if (!reviewed) conflicts.push({ reason: 'review_required' });
    const routes = conflicts.length ? [] : inspectRoutes(applicable, current,
      read(path.join(root, 'content/story-graph.json')),
      read(path.join(world, 'atlas-route-plan.json')));
    console.log(JSON.stringify({ baseMatches, reviewed, routes, alreadyPresent, conflicts }, null, 2));
    if (conflicts.length) process.exitCode = 1;
    return;
  }
  if (!reviewed || !applicable.length) {
    if (command === 'apply') conflicts.unshift({ reason: reviewed ? 'no_new_changes' : 'review_required' });
  }
  if (!conflicts.length) {
    sync.applyOperations(applicable, current);
    conflicts.push(...validatePlacement(current, new Set(applicable.filter(op => op.type === 'plan_edit').map(op => op.id))));
  }
  console.log(JSON.stringify({ baseMatches, reviewed, applicable, alreadyPresent, conflicts }, null, 2));
  if (conflicts.length) { process.exitCode = 1; return; }
  if (command !== 'apply') return;

  // The operator applies the reviewed proposal to their branch. GitHub PR review
  // remains the adoption step. Routes keep their explicit design proposal status.
  snapshot.editor_revision += 1;
  snapshot.history.push({ revision: snapshot.editor_revision, adopted_at: new Date().toISOString(),
    sites_reviewed_at: proposal.reviewed_at, operations: applicable });
  for (const [kind, key] of Object.entries(sync.collections)) snapshot.data[key] = [...current[kind].values()];
  snapshot.placement_overrides ??= {};
  for (const op of applicable.filter(op => op.type === 'plan_edit')) {
    const { level, count } = current.plan.get(op.id);
    snapshot.placement_overrides[op.id] = { level, count };
  }
  output(snapshot, snapshotPath);
}

try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
