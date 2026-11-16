import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>window.mapArt.placements);
const clickAt=async(x,y=478)=>{const box=await p.locator('#png').boundingBox();await p.locator('#png').click({position:{x:x*box.width/960,y:y*box.height/540}})};
const load=async(data)=>{await p.locator('#import').setInputFiles({name:'copy-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await p.waitForFunction(()=>/copy-fixture.jsonを読み込み|読み込み中止/.test(document.getElementById('fileStatus').textContent));assert.match(await p.locator('#fileStatus').innerText(),/copy-fixture.jsonを読み込み/)};
try{
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/map-art.html');await p.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await p.locator('#copySelected').isDisabled(),true);
 const initial=await state();await p.selectOption('#editMode','copy');await clickAt(600);assert.deepEqual(await state(),initial);
 await p.locator('#placements button').first().click();await p.click('#flipSelected');
 const before=await state(),original=before[0];await p.click('#copySelected');assert.deepEqual(await state(),before);
 // Material picker is deliberately unrelated; copy must use selected object.
 await p.selectOption('#species','boss-lava-dragon-molten');await clickAt(600);
 let items=await state(),copy=items.at(-1);assert.equal(items.length,before.length+1);assert.deepEqual(items.slice(0,-1),before);
 assert.notEqual(copy.id,original.id);assert.deepEqual({...copy,id:original.id,x:original.x,y:original.y},original);assert.ok(Math.abs(copy.x-600)<=2,'CSS-scaled click within two world pixels');assert.equal(copy.y,480);
 await clickAt(750);items=await state();assert.equal(new Set(items.map(e=>e.id)).size,items.length);assert.equal(items.at(-1).species,original.species);assert.equal(items.at(-1).flip,original.flip);
 await p.click('#undo');assert.deepEqual(await state(),[...before,copy]);await p.click('#redo');assert.deepEqual(await state(),items);
 await p.click('#saveBrowser');await p.reload();await p.waitForFunction(()=>window.mapArt?.ready);assert.deepEqual(await state(),items);
 await p.locator('#placements button').last().click();await p.click('#copySelected');await p.selectOption('#node','sumeru-entry');const other=await state();await clickAt(500);assert.deepEqual(await state(),other,'node switch clears copy source');
 // Capacity rejection preserves existing redo and current draft.
 const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
 const make=(n,count)=>Array.from({length:count},(_,i)=>({id:'added-'+(i+1),species:'hilichurl',x:n.platforms[0].x,y:n.platforms[0].y,flip:false}));
 const target=graph.nodes.find(n=>n.id==='mond-road');
 for(const fullWorld of [false,true]){
  const fixture={version:1,nodes:{'mond-road':make(target,fullWorld?127:128)}};
  if(fullWorld){const others=graph.nodes.filter(n=>n.id!==target.id).slice(0,8);for(const [i,n] of others.entries())fixture.nodes[n.id]=make(n,i===7?1:128)}
  await load(fixture);await p.selectOption('#node','mond-road');await p.locator('#placements button').first().click();await p.click('#flipSelected');await p.click('#undo');
  const full=await state();await p.click('#copySelected');await clickAt(600);assert.deepEqual(await state(),full);assert.equal(await p.locator('#redo').isEnabled(),true);assert.match(await p.locator('#fileStatus').innerText(),/上限/);
 }
 // Imported added-N IDs must not collide with generated copies.
 await load({version:1,nodes:{'mond-road':make(target,6)}});await p.locator('#placements button').first().click();await p.click('#copySelected');await clickAt(500);items=await state();assert.equal(new Set(items.map(e=>e.id)).size,7);
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.locator('#copySelected').scrollIntoViewIfNeeded();await p.screenshot({path:'evidence/map-copy-mobile.png'});
 assert.deepEqual(errors,[]);await fs.writeFile('evidence/map-copy-test.json',JSON.stringify({errors,checks:['no selection no mutation','arming copy no mutation','material and facing inherited, original unchanged','repeated placement unique IDs','undo redo','browser save reload','node switch clears source','128 node and 1024 total limit preserve draft and redo','imported added-N ID collision avoided','390px no overflow']},null,2));console.log('Copy placement, limits, history, persistence and mobile passed');
}finally{await b.close()}
