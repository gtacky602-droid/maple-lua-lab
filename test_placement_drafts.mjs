import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {validatePlacementDraft as validate} from './placement-drafts.js';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8')),draft=JSON.parse(await fs.readFile('content/enemy-placement-drafts.json','utf8')),species=['hilichurl','hydro-slime','pyro-slime'];
assert.deepEqual(validate(draft,graph,species),draft);const checks=[];
for(const [name,change] of [
 ['version',d=>d.version=2],['null nodes',d=>d.nodes=null],['unknown node',d=>d.nodes.unknown=[]],['unknown species',d=>d.nodes['mond-road'][0].species='unknown'],
 ['duplicate ID',d=>d.nodes['mond-road'][1].id=d.nodes['mond-road'][0].id],['negative x',d=>d.nodes['mond-road'][0].x=-1],['out of bounds',d=>d.nodes['mond-road'][0].x=1441],
 ['nonfinite x',d=>d.nodes['mond-road'][0].x=Infinity],['floating',d=>d.nodes['mond-road'][0].y=479],['string flip',d=>d.nodes['mond-road'][0].flip='false'],
 ['node limit',d=>d.nodes['mond-road']=Array.from({length:129},(_,i)=>({...d.nodes['mond-road'][0],id:'e'+i}))],
 ['total limit',d=>{d.nodes={};for(const n of graph.nodes.slice(0,9))d.nodes[n.id]=Array.from({length:128},(_,i)=>({id:'e'+i,species:'hilichurl',x:n.platforms[0].x,y:n.platforms[0].y,flip:false}))}]
]){const d=structuredClone(draft);change(d);assert.throws(()=>validate(d,graph,species),undefined,name);checks.push(name)}
const extra=structuredClone(draft);extra.nodes['mond-road'][0].html='<script>';assert.equal(validate(extra,graph,species).nodes['mond-road'][0].html,undefined);
await fs.writeFile('evidence/placement-drafts-test.json',JSON.stringify({roundtrip:true,rejected:checks,unknownFieldsDiscarded:true},null,2));console.log('Draft roundtrip and 12 invalid data cases passed');
