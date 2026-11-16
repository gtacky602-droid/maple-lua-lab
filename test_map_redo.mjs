import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>window.mapArt.placements);
const ready=()=>p.waitForFunction(()=>window.mapArt?.ready);
async function add(x=600){await p.selectOption('#editMode','add');const r=await p.locator('#png').boundingBox();await p.locator('#png').click({position:{x:x/960*r.width,y:478/540*r.height}})}
async function roundtrip(before,after){await p.click('#undo');assert.deepEqual(await state(),before);await p.click('#redo');assert.deepEqual(await state(),after)}
try{
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/map-art.html');await ready();
 let before=await state();await add();let after=await state();await roundtrip(before,after);
 await p.locator('#placements button').last().click();before=await state();await p.click('#flipSelected');after=await state();await roundtrip(before,after);
 before=await state();const r=await p.locator('#png').boundingBox();await p.locator('#png').click({position:{x:750/960*r.width,y:478/540*r.height}});after=await state();assert.notDeepEqual(before,after);await roundtrip(before,after);
 before=await state();await p.click('#deleteSelected');after=await state();await roundtrip(before,after);
 await p.click('#undo');const mond=await state();assert.equal(await p.locator('#redo').isEnabled(),true);
 await p.selectOption('#node','sumeru-entry');assert.equal(await p.locator('#redo').isDisabled(),true);await add();await p.click('#undo');assert.equal(await p.locator('#redo').isEnabled(),true);
 await p.selectOption('#node','mond-road');assert.deepEqual(await state(),mond);assert.equal(await p.locator('#redo').isEnabled(),true);
 await add(800);assert.equal(await p.locator('#redo').isDisabled(),true);
 await p.selectOption('#node','sumeru-entry');assert.equal(await p.locator('#redo').isEnabled(),true);await p.click('#redo');
 before=await state();await p.click('#reset');after=await state();await roundtrip(before,after);
 before=await state();await p.click('#loadLive');await p.waitForFunction(()=>!document.getElementById('loadLive').disabled);after=await state();await roundtrip(before,after);
 const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const nodes=[graph.nodes.find(n=>n.id==='mond-road'),...graph.nodes.filter(n=>n.id!=='mond-road')].slice(0,8);
 const fixture={version:1,nodes:Object.fromEntries(nodes.map(n=>[n.id,Array.from({length:128},(_,i)=>({id:'limit-'+i,species:'hilichurl',x:n.platforms[0].x,y:n.platforms[0].y,flip:false}))]))};
 await p.locator('#import').setInputFiles({name:'limit.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await p.waitForFunction(()=>document.getElementById('fileStatus').textContent.includes('limit.jsonを読み込み'));
 assert.equal(await p.locator('#undo').isDisabled(),true);assert.equal(await p.locator('#redo').isDisabled(),true);
 await p.selectOption('#node','mond-road');await p.click('#reset');
 const other=graph.nodes.find(n=>!fixture.nodes[n.id]);await p.selectOption('#node',other.id);await add();
 await p.selectOption('#node','mond-road');const preserved=await state();await p.click('#undo');assert.deepEqual(await state(),preserved);assert.match(await p.locator('#fileStatus').innerText(),/1024/);
 await p.selectOption('#node',other.id);await p.click('#undo');await p.selectOption('#node','mond-road');await p.click('#undo');assert.equal((await state()).length,128);await p.click('#redo');assert.deepEqual(await state(),preserved);
 await p.click('#saveBrowser');const saved=await state();await p.reload();await ready();assert.deepEqual(await state(),saved);assert.equal(await p.locator('#undo').isDisabled(),true);assert.equal(await p.locator('#redo').isDisabled(),true);
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.screenshot({path:'evidence/map-redo-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/map-redo-test.json',JSON.stringify({errors,checks:['add/flip/move/delete/reset/live-load undo and redo','per-node isolation','new edit invalidates only current redo','import clears histories','1024 total limit rejects restore without losing history','restore succeeds after freeing capacity','reload retains saved draft but clears histories','390px no overflow']},null,2));
 console.log('Map undo/redo, node isolation, restore capacity and mobile passed');
}finally{await b.close()}
