import assert from 'node:assert/strict';
import {comparePlacements} from './placement-drafts.js';
import {chromium} from 'playwright';import fs from 'node:fs/promises';
const e={id:'one',species:'hilichurl',x:100,y:480,flip:false},other={...e,id:'two'};
assert.deepEqual(comparePlacements([e],[e]),{added:[],removed:[],changed:[],unchanged:1});
const changed={...e,species:'nobushi',x:200,y:300,flip:true};
assert.deepEqual(comparePlacements([e,other],[changed,{...e,id:'new'}]).changed[0].fields,['species','x','y','flip']);
assert.equal(comparePlacements([e,other],[changed]).removed[0].id,'two');
assert.equal(comparePlacements([],[e]).added.length,1);
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1400}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>window.mapArt);
try{
 await p.goto('http://127.0.0.1:8769/map-art.html');await p.waitForFunction(()=>window.mapArt?.ready);
 const before=(await state()).placements;await p.click('#compareLive');await p.waitForFunction(()=>!document.getElementById('compareLive').disabled);
 assert.deepEqual((await state()).placements,before);assert.ok((await state()).diff);
 await p.click('#loadLive');await p.waitForFunction(()=>!document.getElementById('loadLive').disabled);assert.equal((await state()).diff.unchanged,6);
 await p.locator('#placements button').first().click();await p.click('#flipSelected');assert.deepEqual((await state()).diff.changed[0].fields,['flip']);
 await p.click('#deleteSelected');assert.equal((await state()).diff.removed.length,1);await p.click('#undo');assert.equal((await state()).diff.changed.length,1);
 await p.selectOption('#editMode','add');const box=await p.locator('#png').boundingBox();await p.mouse.click(box.x+200/960*box.width,box.y+479/540*box.height);assert.equal((await state()).diff.added.length,1);
 const saved=await state();await p.route('**/content/enemy-spawns.json',r=>r.fulfill({status:503,body:'unavailable'}));await p.click('#compareLive');await p.waitForFunction(()=>!document.getElementById('compareLive').disabled);assert.deepEqual((await state()).placements,saved.placements);assert.deepEqual((await state()).diff,saved.diff);
 await p.screenshot({path:'evidence/placement-diff.png',fullPage:true});await p.selectOption('#node','mond-town');assert.equal((await state()).diff,null);await p.selectOption('#node','mond-road');assert.deepEqual((await state()).diff,saved.diff);
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/placement-diff.json',JSON.stringify({checks:['all four changed fields','add/remove/unchanged','read-only fetch','live copy initializes baseline','flip/delete/undo/add update comparison','failed refresh preserves draft and baseline','node isolation','390px layout'],errors},null,2));console.log('Placement diff unit and browser checks passed');
}finally{await b.close()}

