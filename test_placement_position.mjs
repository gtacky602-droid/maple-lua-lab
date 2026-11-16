import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>window.mapArt.placements);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8')),n=graph.nodes.find(n=>n.id==='mond-road');
try{
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/map-art.html');await p.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await p.locator('#applyPlacementPosition').isDisabled(),true);
 await p.locator('#placements button').first().click();await p.click('#flipSelected');const before=await state(),original=before[0];
 assert.equal(await p.inputValue('#placementX'),String(original.x));
 const index=n.platforms.findIndex(s=>s.y!==original.y);assert.ok(index>=0);const support=n.platforms[index],x=Math.min(n.width,support.x+support.w/2)+.25;
 await p.selectOption('#placementPlatform',String(index));await p.fill('#placementX',String(x));
 // Changing display settings must preserve pending input until explicit apply.
 await p.selectOption('#profile','legacy');await p.dispatchEvent('#profile','input');assert.equal(await p.inputValue('#placementX'),String(x));assert.deepEqual(await state(),before);
 await p.click('#applyPlacementPosition');const after=before.map(e=>e.id===original.id?{...e,x,y:support.y}:e);assert.deepEqual(await state(),after);
 await p.click('#undo');assert.deepEqual(await state(),before);assert.equal(await p.inputValue('#placementX'),String(original.x));
 await p.click('#applyPlacementPosition');assert.deepEqual(await state(),before);assert.equal(await p.locator('#redo').isEnabled(),true);
 for(const value of ['', '-1', String(n.width+1)]){await p.fill('#placementX',value);await p.click('#applyPlacementPosition');assert.deepEqual(await state(),before);assert.equal(await p.locator('#redo').isEnabled(),true)}
 await p.selectOption('#placementPlatform',String(index));await p.fill('#placementX',String(support.x-1));await p.click('#applyPlacementPosition');assert.deepEqual(await state(),before);assert.equal(await p.locator('#redo').isEnabled(),true);
 await p.click('#redo');assert.deepEqual(await state(),after);assert.equal(await p.inputValue('#placementX'),String(x));
 await p.click('#saveBrowser');await p.reload();await p.waitForFunction(()=>window.mapArt?.ready);assert.deepEqual(await state(),after);assert.equal(await p.locator('#applyPlacementPosition').isDisabled(),true);
 await p.locator('#placements button').first().click();assert.equal(await p.inputValue('#placementX'),String(x));await p.selectOption('#node','sumeru-entry');assert.equal(await p.inputValue('#placementX'),'');assert.equal(await p.locator('#applyPlacementPosition').isDisabled(),true);
 await p.selectOption('#node','mond-road');await p.locator('#placements button').first().click();await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.locator('#placementX').scrollIntoViewIfNeeded();await p.screenshot({path:'evidence/placement-position-mobile.png'});
 assert.deepEqual(errors,[]);await fs.writeFile('evidence/placement-position-test.json',JSON.stringify({errors,checks:['no selection disabled','fractional X and elevated platform explicit move','ID material facing other objects preserved','pending fields survive profile change','same and invalid input preserve redo','undo redo update inputs','browser save reload','node switch clears fields','390px no overflow']},null,2));console.log('Explicit placement position, rejection, history and persistence passed');
}finally{await b.close()}
