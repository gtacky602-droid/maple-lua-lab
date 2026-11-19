'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const sync = require('./sync.js');

const root = path.resolve(__dirname, '../..');
const snapshot = require('../../design/world/editor-snapshot.json');
const plan = require('../../design/world/placements/region-05.json').fields
  .find(field => field.field_id === 'teyvat:50074');
const row = plan.regular_spawns[0];
const change = { type: 'plan_edit', id: row.id, changes: { count: { before: row.count, after: row.count - 1 } } };

test('an edit conflict retains both values and is not counted as applied', () => {
  const state = sync.buildState(snapshot, [row]);
  state.plan.get(row.id).count -= 2;
  const result = sync.compareOperations([change], state);
  assert.equal(result.alreadyPresent.length, 0);
  assert.equal(result.applicable.length, 0);
  assert.deepEqual(result.conflicts[0], {
    id: row.id, type: 'plan_edit', reason: 'value_changed', key: 'count',
    before: row.count, after: row.count - 1, current: row.count - 2
  });
});

test('coordinates, IDs and deletes require separate decisions', () => {
  const altered = structuredClone(snapshot);
  altered.data.fields[0].x += 1;
  assert.equal(sync.validSnapshot(altered, snapshot.data), false);
  const state = sync.buildState(snapshot, [row]);
  const edge = snapshot.data.edges[0];
  const result = sync.compareOperations([{ type: 'edge_delete', id: edge.id, before: edge }],
    state, { protectDeletion: true });
  assert.equal(result.conflicts[0].reason, 'deletion_requires_separate_review');
  assert.deepEqual(state.edge.get(edge.id), edge);
});

test('CLI export, check, explicit apply, import and stale detection', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'maple-design-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const dir of ['tools/world_design', 'design/world']) {
    fs.cpSync(path.join(root, dir), path.join(temp, dir), { recursive: true });
  }
  fs.mkdirSync(path.join(temp, 'design/field-editor'), { recursive: true });
  fs.copyFileSync(path.join(root, 'design/field-editor/project.json'),
    path.join(temp, 'design/field-editor/project.json'));
  const proposal = path.join(temp, 'proposal.json');
  const exportPath = path.join(temp, 'roundtrip.json');
  const run = (command, filename) => spawnSync(process.execPath, [
    path.join(temp, 'tools/world_design/transfer.js'), command, filename
  ], { cwd: temp, encoding: 'utf8' });
  const input = { schema: sync.proposalSchema, review_status: 'draft',
    base_revision_snapshot: snapshot.data.revision_snapshot, base_project_blob_sha: snapshot.data.canonical_sha,
    base_editor_revision: snapshot.editor_revision, reviewed_at: '2026-11-19T00:00:00Z', operations: [change] };
  fs.writeFileSync(proposal, JSON.stringify(input));
  assert.equal(run('check', proposal).status, 0);
  assert.equal(run('apply', proposal).status, 1);
  fs.writeFileSync(proposal, JSON.stringify({ ...input, review_status: 'reviewed_proposal' }));
  assert.equal(run('apply', proposal).status, 0);
  assert.equal(run('export', exportPath).status, 0);
  const reopened = JSON.parse(fs.readFileSync(exportPath));
  assert.equal(sync.validSnapshot(reopened, snapshot.data, [row]), true);
  assert.deepEqual(reopened.placement_overrides[row.id], { level: row.level, count: row.count - 1 });
  assert.deepEqual(reopened.data.edges, snapshot.data.edges);
  assert.deepEqual(reopened.history.at(-1).operations, [change]);
  const stale = run('check', proposal);
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).conflicts[0].reason, 'stale_base');
});
