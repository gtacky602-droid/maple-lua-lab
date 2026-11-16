import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {liveNodeDraft} from './placement-drafts.js';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8')),live=JSON.parse(await fs.readFile('content/enemy-spawns.json','utf8'));
const species=['hydro-slime-reference','pyro-slime-reference','hilichurl','ruin-guard','dendro-fungus'];let total=0;
for(const node of graph.nodes){const items=liveNodeDraft(live,graph,node.id,species);total+=items.length;for(const [i,e] of items.entries()){const source=live.nodes[node.id][i];assert.equal(e.id,source.id);assert.equal(e.x,source.x);assert.equal(e.y,node.platforms[source.platform].y)}}
assert.equal(total,156);
for(const change of [d=>d.version=2,d=>delete d.nodes['mond-road'],d=>d.nodes['mond-road'][0].art='unknown',d=>d.nodes['mond-road'][0].platform=999,d=>d.nodes['mond-road'][0].platform='0',d=>d.nodes['mond-road'][4].x=0]){const broken=structuredClone(live);change(broken);assert.throws(()=>liveNodeDraft(broken,graph,'mond-road',species))}
console.log('61 live spawn conversions, 156 identities/supports and 6 invalid-source cases passed');
