import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const art=JSON.parse(await fs.readFile('assets/legatus-idle-sprites.json','utf8'));
const url=(process.env.LAB_URL||'http://127.0.0.1:8771')+'/map-art.html';
const state=()=>p.evaluate(()=>window.mapArt);
const ready=()=>p.waitForFunction(()=>window.mapArt?.ready);
const checked=[];
async function run(node,wide){
 const ground=node.platforms.find(q=>q.x===0&&q.w===node.width);assert.ok(ground);
 const specs=[['left','hilichurl',0,false],['right','hilichurl',node.width,false],['offset','boss-legatus',Math.round(node.width*.65),false],['mirrored','boss-legatus',Math.round(node.width*.65),true]];
 const draft={version:1,nodes:{[node.id]:specs.map(([id,species,x,flip])=>({id,species,x,y:ground.y,flip}))}};
 await p.locator('#import').setInputFiles({name:'focus.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(draft))});
 await p.waitForFunction(()=>document.getElementById('fileStatus').textContent.includes('focus.jsonを読み込み'));
 await p.selectOption('#node',node.id);await p.click('#saveBrowser');
 const status=await p.locator('#browserStatus').innerText();
 for(const [id,species,x,flip] of specs){
  await p.locator(`#placements button[data-id="${id}"]`).click();
  const before=(await state()).placements;
  await p.click('#focusSelected');const s=await state();
  const center=x+(species==='boss-legatus'?200*art.box[2]/art.box[3]*(.5-(art.anchorX??.5))*(flip?-1:1):0);
  const expected=Math.round(Math.max(0,Math.min(node.width-960,center-480)));
  assert.equal(s.camera,expected);assert.equal(s.selected,id);assert.deepEqual(s.placements,before);
  assert.equal(await p.locator('#browserStatus').innerText(),status);
  assert.equal(await p.locator('#undo').isDisabled(),true);
  assert.equal(await p.locator('#redo').isDisabled(),true);
  const box=await p.locator('#png').boundingBox();assert.ok(box.y>=0&&box.y<1000);
  checked.push({wide,id,camera:s.camera});
 }
 await p.click('#clearSelection');assert.equal(await p.locator('#focusSelected').isDisabled(),true);
 await p.locator('#placements button').first().click();await p.click('#deleteSelected');assert.equal(await p.locator('#focusSelected').isDisabled(),true);
 await p.click('#undo');await p.locator('#placements button').first().click();await p.selectOption('#node','mond-town');assert.equal(await p.locator('#focusSelected').isDisabled(),true);
}
try{
 await p.goto(url);await ready();assert.equal(await p.locator('#focusSelected').isDisabled(),true);
 await run(graph.nodes.find(n=>n.id==='mond-road'),false);
 await p.evaluate(()=>localStorage.clear());
 const wide=structuredClone(graph),node=wide.nodes.find(n=>n.id==='mond-road');const floor=node.platforms.find(q=>q.x===0&&q.w===node.width);node.width=4800;floor.w=4800;
 await p.route('**/content/story-graph.json',r=>r.fulfill({json:wide}));await p.reload();await ready();await run(node,true);
 await p.selectOption('#node','mond-road');await p.setViewportSize({width:390,height:844});await p.locator('#placements button[data-id="offset"]').click();await p.click('#focusSelected');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.screenshot({path:'evidence/map-focus-mobile.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/map-focus-test.json',JSON.stringify({errors,checked,checks:['actual map edges','4800px future-width fixture','asymmetric anchor and mirrored center','coordinates/selection/save status/history unchanged','clear/delete/node switch disable focus','390px no overflow and canvas scrolled into view']},null,2));
 console.log('Map selection focus, bounds, anchor, editing isolation and mobile passed');
}finally{await b.close()}
