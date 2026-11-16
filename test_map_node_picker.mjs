import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>window.mapArt);
try{
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/map-art.html');await p.waitForFunction(()=>window.mapArt?.ready);
 await p.locator('#mapNodePicker summary').click();assert.equal(await p.locator('#nodeSearchResults button').count(),61);
 const before=await state(),saveStatus=await p.locator('#browserStatus').innerText();
 await p.selectOption('#nodePlacementFilter','placed');assert.equal(await p.locator('#nodeSearchResults button').count(),1);assert.match(await p.locator('#nodeSearchResults button').innerText(),/3体/);
 await p.selectOption('#nodeRegion','スメール');assert.equal(await p.locator('#nodeSearchResults button').count(),0);assert.deepEqual(await state(),before);assert.equal(await p.locator('#browserStatus').innerText(),saveStatus);
 await p.click('#clearNodeSearch');await p.fill('#nodeSearch','ＳＵＭＥＲＵ　ＥＮＴＲＹ');assert.equal(await p.locator('#nodeSearchResults button').count(),1);
 await p.locator('#nodeSearchResults button').click();assert.equal((await state()).node,'sumeru-entry');assert.deepEqual((await state()).placements,[]);
 // Adding and undoing update counts while the filter remains active.
 await p.selectOption('#editMode','add');const r=await p.locator('#png').boundingBox();await p.locator('#png').click({position:{x:r.width*.5,y:r.height*.89}});
 assert.match(await p.locator('#nodeSearchResults button').innerText(),/1体/);await p.click('#undo');assert.match(await p.locator('#nodeSearchResults button').innerText(),/0体/);await p.click('#redo');
 await p.click('#saveBrowser');await p.reload();await p.waitForFunction(()=>window.mapArt?.ready);await p.locator('#mapNodePicker summary').click();await p.selectOption('#nodePlacementFilter','placed');assert.equal(await p.locator('#nodeSearchResults button').count(),2);
 await p.locator('#nodeSearchResults button[data-node="sumeru-entry"]').click();assert.equal((await state()).count,1);await p.locator('#placements button').first().click();await p.click('#deleteSelected');assert.equal(await p.locator('#nodeSearchResults button').count(),1);assert.equal((await state()).node,'sumeru-entry');assert.match(await p.locator('#nodeSearchStatus').innerText(),/絞り込み対象外/);await p.click('#undo');assert.equal(await p.locator('#nodeSearchResults button').count(),2);
 // Import changes all per-node counts, without filters changing data.
 await p.locator('#import').setInputFiles({name:'blank.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,nodes:{}}))});await p.waitForFunction(()=>document.getElementById('fileStatus').textContent.includes('blank.jsonを読み込み'));assert.equal(await p.locator('#nodeSearchResults button').count(),0);
 await p.click('#clearNodeSearch');await p.selectOption('#nodeRegion','モンド');assert.ok(await p.locator('#nodeSearchResults button').count()>0);assert.ok((await p.locator('#nodeSearchResults button').allTextContents()).every(s=>s.startsWith('モンド｜')));
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.locator('#mapNodePicker').scrollIntoViewIfNeeded();await p.screenshot({path:'evidence/map-node-picker-mobile.png'});
 assert.deepEqual(errors,[]);await fs.writeFile('evidence/map-node-picker-test.json',JSON.stringify({errors,checks:['all61 nodes listed','region and placed intersection','filter preserves map/draft/save status','NFKC AND search','explicit navigation','add undo redo update counts','browser saved drafts restore counts','active map remains when removed from filter','delete undo and import update counts','390px no horizontal overflow']},null,2));console.log('Map node search, placement counts and state isolation passed');
}finally{await b.close()}
