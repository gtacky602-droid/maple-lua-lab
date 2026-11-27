'use strict';

const pair = (a, b) => JSON.stringify([a, b].sort());
const hasMapPosition = field => field.map != null && Number.isFinite(field.x) && Number.isFinite(field.y);

function connectedFields(fields, edges) {
  const adjacent = new Map(fields.map(field => [field, []]));
  for (const {a, b} of edges) {
    if (!adjacent.has(a) || !adjacent.has(b)) continue;
    adjacent.get(a).push(b);
    adjacent.get(b).push(a);
  }
  const grouped = new Map();
  const groups = [];
  for (const start of fields) {
    if (grouped.has(start)) continue;
    const group = [start];
    grouped.set(start, groups.length);
    for (let i = 0; i < group.length; i++) {
      for (const next of adjacent.get(group[i])) {
        if (grouped.has(next)) continue;
        grouped.set(next, groups.length);
        group.push(next);
      }
    }
    groups.push(group);
  }
  return {groups, grouped};
}

function inspectConnectivity(fields, state, routes) {
  const nextEdges = new Map(state.edge);
  for (const route of routes) {
    if (route.after) nextEdges.set(route.id, route.after);
    else nextEdges.delete(route.id);
  }
  const before = connectedFields(fields, state.edge.values());
  const after = connectedFields(fields, nextEdges.values());
  const splitComponents = [];
  for (const group of before.groups) {
    const pieces = new Map();
    for (const field of group) {
      const id = after.grouped.get(field);
      if (!pieces.has(id)) pieces.set(id, []);
      pieces.get(id).push(field);
    }
    if (pieces.size > 1) splitComponents.push([...pieces.values()].map(piece => piece.sort()));
  }
  return {
    field_count: fields.length, before_components: before.groups.length, after_components: after.groups.length,
    newly_isolated: after.groups.filter(group => group.length === 1 &&
      before.groups[before.grouped.get(group[0])].length > 1).map(([field]) => field),
    split_components: splitComponents,
  };
}

function inspectRoutes(operations, state, graph, routePlan) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const stages = new Map();
  for (const node of graph.nodes) {
    const field = node.mapPoint ?? node.designField;
    if (!field) continue;
    if (stages.has(field)) throw Error('Multiple stages bound to ' + field);
    stages.set(field, node);
  }
  const suspended = graph.suspendedRegions ?? {};
  const routes = new Map(routePlan.sites_only_route_review.map(row => [pair(...row.fields), row]));
  const exits = (from, to) => nodes.get(from)?.exits.filter(exit => exit.to === to) ?? [];
  const direct = (from, to) => {
    const trips = exits(from, to).map(exit => ({ kind: 'gate', ...exit }));
    const voyage = nodes.get(from)?.voyage;
    if (voyage?.destination === to) trips.push({ kind: 'voyage', ...voyage });
    return trips;
  };

  const changes = operations.filter(op => ['edge_add', 'edge_edit', 'edge_delete'].includes(op.type)).map(op => {
    const id = op.id ?? op.data?.id;
    const before = op.type === 'edge_add' ? null : state.edge.get(id);
    let after = null;
    if (op.type === 'edge_add') after = op.data;
    if (op.type === 'edge_edit') {
      const changes = Object.fromEntries(Object.entries(op.changes).map(([key, value]) => [key, value.after]));
      after = { ...before, ...changes };
    }
    const { a, b } = before ?? after;
    const endpoints = [a, b].map(id => {
      const field = state.field.get(id);
      const node = stages.get(id);
      return {
        id, region: field.region, name: field.name, map: field.map ?? null,
        position: Number.isFinite(field.x) && Number.isFinite(field.y) ? [field.x, field.y] : null,
        layer: field.layer ?? null, point_group: field.point_group ?? null,
        recommended_level: field.lv ?? null, stage: node?.id ?? null, stage_level: node?.level ?? null
      };
    });
    const [from, to] = endpoints.map(endpoint => endpoint.stage);
    const review = routes.get(pair(a, b));
    const paths = Object.fromEntries(Object.entries(review?.runtime_paths ?? {}).map(([direction, path]) => {
      const missing = path.slice(1).map((target, i) => [path[i], target])
        .filter(([start, end]) => !direct(start, end).length);
      let relativeDirection = direction;
      if (review.fields[0] !== a) relativeDirection = direction === 'forward' ? 'return' : 'forward';
      return [relativeDirection, { stages: path, missing_hops: missing }];
    }));
    let scope = 'map_linked';
    if (endpoints.some(endpoint => Object.hasOwn(suspended, nodes.get(endpoint.stage)?.region)))
      scope = 'suspended_region';
    else if ([a, b].some(id => !hasMapPosition(state.field.get(id))))
      scope = 'no_map_position';
    else if (!from || !to) scope = 'no_stage_binding';
    return {
      id, operation: op.type, scope, endpoints,
      before, after, direct: { forward: direct(from, to), return: direct(to, from) },
      recorded_route: review ? { finding: review.finding, paths } : null
    };
  });
  const mapped = [...state.field.values()].filter(field => hasMapPosition(field) &&
    stages.has(field.id) && !Object.hasOwn(suspended, stages.get(field.id).region)).map(field => field.id).sort();
  return { routes: changes, connectivity: inspectConnectivity(mapped, state, changes) };
}

module.exports = { inspectRoutes };
