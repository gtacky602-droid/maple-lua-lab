import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>window.mapArt.placements);
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=graph.nodes.filter(n=>n.id!=='mond-road').slice(0,8);
const fixture={version:1,nodes:Object.fromEntries(nodes.map(n=>[n.id,Array.from({length:128},(_,i)=>({id:'limit-'+i,species:'hilichurl',x:n.platforms[0].x,y:n.platforms[0].y,flip:false}))]))};
try{
 await page.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/map-art.html');await page.waitForFunction(()=>window.mapArt?.ready);
 await page.locator('#import').setInputFiles({name:'full.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>document.getElementById('fileStatus').textContent.includes('full.jsonを読み込み'));
 // The target is empty while eight other nodes consume all capacity.
 const blank=await state();assert.deepEqual(blank,[]);
 await page.click('#reset');assert.deepEqual(await state(),blank,'Reset must not overflow global limit');
 assert.match(await page.locator('#fileStatus').innerText(),/1024/);
 assert.equal(await page.locator('#undo').isDisabled(),true);
 // Free exactly three slots elsewhere, then reset successfully and round-trip history.
 await page.selectOption('#node',nodes[0].id);
 for(let i=0;i<3;i++){await page.locator('#placements button').last().click();await page.click('#deleteSelected')}
 await page.selectOption('#node','mond-road');await page.click('#reset');const restored=await state();assert.equal(restored.length,3);
 await page.click('#undo');assert.deepEqual(await state(),[]);assert.equal(await page.locator('#redo').isEnabled(),true);
 // A reset rejection must not discard an existing redo branch.
 await page.selectOption('#node',nodes[0].id);await page.click('#undo');
 await page.selectOption('#node','mond-road');await page.click('#reset');assert.deepEqual(await state(),[]);assert.equal(await page.locator('#redo').isEnabled(),true);
 await page.selectOption('#node',nodes[0].id);await page.click('#redo');await page.selectOption('#node','mond-road');await page.click('#redo');assert.deepEqual(await state(),restored);
 await page.click('#saveBrowser');assert.match(await page.locator('#browserStatus').innerText(),/保存しました/);
 await page.reload();await page.waitForFunction(()=>window.mapArt?.ready);assert.deepEqual(await state(),restored);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/map-reset-capacity-test.json',JSON.stringify({errors,checks:['1024 full fixture rejects reset before mutation','rejection does not create undo','freeing 3 slots permits 3-item initial reset','undo/redo restores reset','rejected reset preserves existing redo','1024-item draft saves and reloads']},null,2));
 console.log('Reset capacity and history preservation passed');
}finally{await browser.close()}
