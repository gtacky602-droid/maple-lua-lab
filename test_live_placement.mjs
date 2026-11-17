import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {liveNodeDraft} from './placement-drafts.js';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8')),live=JSON.parse(await fs.readFile('content/enemy-spawns.json','utf8'));
const layout=JSON.parse(await fs.readFile('content/enemy-art-layout.json','utf8'));
const species=Object.keys(layout).map(id=>id==='hydro-slime'||id==='pyro-slime'?id+'-reference':id);let total=0;
for(const node of graph.nodes){const items=liveNodeDraft(live,graph,node.id,species);total+=items.length;for(const [i,e] of items.entries()){const source=live.nodes[node.id][i];assert.equal(e.id,source.id);assert.equal(e.x,source.x);assert.equal(e.y,node.platforms[source.platform].y)}}
assert.equal(total,Object.values(live.nodes).reduce((sum,items)=>sum+items.length,0));
for(const change of [d=>d.version=2,d=>delete d.nodes['mond-road'],d=>d.nodes['mond-road'][0].art='unknown',d=>d.nodes['mond-road'][0].platform=999,d=>d.nodes['mond-road'][0].platform='0',d=>d.nodes['mond-road'][4].x=0]){const broken=structuredClone(live);change(broken);assert.throws(()=>liveNodeDraft(broken,graph,'mond-road',species))}
console.log(graph.nodes.length, "live spawn conversions,", total, "identities/supports and 6 invalid-source cases passed");
