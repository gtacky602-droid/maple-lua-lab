import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {validatePlacementDraft as validate} from './placement-drafts.js';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8')),draft=JSON.parse(await fs.readFile('content/enemy-placement-drafts.json','utf8')),layout=JSON.parse(await fs.readFile('content/enemy-art-layout.json','utf8'));
const species=Object.keys(layout);
for (const [kind,file] of [['boss','boss-art-gallery'],['character','character-art-gallery']]) {
 const gallery=JSON.parse(await fs.readFile('content/'+file+'.json','utf8'));
 species.push(...gallery.items.map(item=>kind+'-'+item.id));
}
assert.deepEqual(validate(draft,graph,species),draft);const checks=[];
for(const [name,change] of [
 ['version',d=>d.version=2],['null nodes',d=>d.nodes=null],['unknown node',d=>d.nodes.unknown=[]],['unknown species',d=>d.nodes['mond-road'][0].species='unknown'],
 ['duplicate ID',d=>d.nodes['mond-road'][1].id=d.nodes['mond-road'][0].id],['negative x',d=>d.nodes['mond-road'][0].x=-1],['out of bounds',d=>d.nodes['mond-road'][0].x=1441],
 ['nonfinite x',d=>d.nodes['mond-road'][0].x=Infinity],['floating',d=>d.nodes['mond-road'][0].y=479],['string flip',d=>d.nodes['mond-road'][0].flip='false'],
 ['node limit',d=>d.nodes['mond-road']=Array.from({length:129},(_,i)=>({...d.nodes['mond-road'][0],id:'e'+i}))],
 ['total limit',d=>{d.nodes={};for(const n of graph.nodes.slice(0,9))d.nodes[n.id]=Array.from({length:128},(_,i)=>({id:'e'+i,species:'hilichurl',x:n.platforms[0].x,y:n.platforms[0].y,flip:false}))}]
]){const d=structuredClone(draft);change(d);assert.throws(()=>validate(d,graph,species),undefined,name);checks.push(name)}
const previousShelfRows = [
 ['branch-hunt-64840',393,419],
 ['branch-hunt-64841',419,417],
 ['branch-hunt-64842',419,430],
 ['branch-hunt-64844',419,428],
 ['branch-hunt-64834',402,424],
 ['branch-hunt-64835',393,420],
 ['branch-hunt-64836',393,417],
 ['branch-hunt-64838',419,426],
 ['branch-hunt-64839',419,416],
 ['branch-hunt-64830',393,418],
 ['branch-hunt-64831',393,424],
 ['branch-hunt-64832',393,418],
 ['branch-hunt-64833',402,417],
 ['branch-hunt-64827',402,419],
 ['branch-hunt-64828',402,417],
 ['branch-hunt-64829',393,420],
 ['branch-hunt-64824',393,401],
 ['branch-hunt-64825',419,419],
 ['branch-hunt-68600',408,415],
 ['branch-hunt-68603',408,424],
 ['branch-hunt-68607',408,407],
 ['sites-hunt-28752',390,416],
 ['sites-hunt-28753',390,399],
 ['sites-hunt-28756',390,361],
 ['sites-hunt-41009',390,404],
 ['sites-hunt-98499',398,412],
 ['sites-hunt-46531',390,375],
 ['sites-hunt-46532',423,412],
 ['sites-hunt-46533',423,423],
 ['sites-hunt-46534',423,400],
 ['sites-hunt-24907',403,381],
 ['sites-hunt-68346',408,419],
 ['sites-hunt-7164',407,417],
 ['sites-hunt-100705',407,381],['sites-hunt-100706',407,423],['sites-hunt-100707',398,379],
 ['sites-hunt-88121',396,382],
 ['sites-hunt-88122',396,372],
 ['sites-hunt-88123',396,424],
 ['sites-hunt-92859',396,374],
 ['sites-hunt-92860',398,418],
 ['sites-hunt-7173',403,417],
 ['sites-hunt-7190',403,424],
 ['sites-hunt-7215',403,424],
 ['sites-hunt-7218',403,419],
 ['sites-hunt-7220',403,379],
 ['sites-hunt-9778',403,390],
 ['sites-hunt-18048',403,419],
 ['sites-hunt-7114',403,419],['sites-hunt-7116',403,422],['sites-hunt-7121',403,426],
 ['sites-hunt-7149',397,365],
 ['sites-hunt-7157',397,417],
 ['sites-hunt-7186',397,424],
 ['sites-hunt-7201',397,420],
 ['sites-hunt-7206',397,422],
 ['sites-hunt-7210',397,381],
 ['sites-hunt-7092',397,374],['sites-hunt-7111',397,364],['sites-hunt-7137',397,421],
 ['sites-hunt-15949',398,365],['sites-hunt-17223',408,423],['sites-hunt-18667',408,383],
 ['sites-hunt-20369',408,421],['sites-hunt-24906',408,419],
 ['sites-hunt-12788',408,422],['sites-hunt-12791',408,420],['sites-hunt-12794',408,367],
 ['sites-hunt-12778',398,417],['sites-hunt-12781',408,422],['sites-hunt-12784',408,397],
 ['sites-hunt-28751',390,413],['sites-hunt-28754',390,366],
 ['sites-hunt-28755',390,345],['sites-hunt-28757',398,382],
];
for (const [id,y,newY] of previousShelfRows) {
 const placement = {id:'kept',species:'hilichurl',x:700,y,flip:true};
 const saved = {version:1,nodes:{[id]:[placement]}};
 const migrated = validate(saved,graph,species);
 assert.deepEqual(migrated.nodes[id],[{...placement,y:newY}]);
 assert.deepEqual(validate(migrated,graph,species),migrated);
 placement.x=200;
 assert.throws(()=>validate(saved,graph,species));
}
const oldCoralDraft = x=>({version:1,nodes:{'branch-hunt-68600':[{id:'ledge',species:'hilichurl',x,y:408,flip:false}]}});
assert.equal(validate(oldCoralDraft(923),graph,species).nodes['branch-hunt-68600'][0].y,415);
assert.throws(()=>validate(oldCoralDraft(950),graph,species));
const extra=structuredClone(draft);extra.nodes['mond-road'][0].html='<script>';assert.equal(validate(extra,graph,species).nodes['mond-road'][0].html,undefined);
await fs.writeFile('evidence/placement-drafts-test.json',JSON.stringify({roundtrip:true,rejected:checks,unknownFieldsDiscarded:true},null,2));console.log('Draft roundtrip and 12 invalid data cases passed');
