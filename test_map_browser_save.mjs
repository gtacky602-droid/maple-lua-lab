import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const url=(process.env.LAB_URL||'http://127.0.0.1:8771')+'/map-art.html';
const key='maple-lua-lab.map-draft.v1';
const ready=p=>p.waitForFunction(()=>window.mapArt?.ready,null,{timeout:60000});
const state=()=>page.evaluate(()=>window.mapArt.placements);
const raw=()=>page.evaluate(k=>localStorage.getItem(k),key);
async function add(species,x){
 await page.selectOption('#editMode','add');await page.selectOption('#species',species);
 const box=await page.locator('#png').boundingBox();
 await page.mouse.click(box.x+x/960*box.width,box.y+478/540*box.height);
}
try{
 await page.goto(url);await ready(page);
 await add('character-traveler',600);const mond=await state();
 await page.selectOption('#node','sumeru-entry');await add('boss-asimon',700);const sumeru=await state();
 await page.click('#saveBrowser');const saved=await raw();assert.ok(saved);
 await add('hilichurl',800);assert.match(await page.locator('#browserStatus').innerText(),/未保存/);await page.reload();await ready(page);
 assert.deepEqual(await state(),mond);
 await page.selectOption('#node','sumeru-entry');assert.deepEqual(await state(),sumeru);
 assert.equal(await page.evaluate(()=>window.mapArt.visuals.at(-1).hover),48);
 // Another tab must not silently overwrite a newer saved draft.
 const second=await context.newPage();await second.goto(url);await ready(second);
 await add('character-amber',820);await page.click('#saveBrowser');const latest=await raw();
 await second.click('#saveBrowser');assert.match(await second.locator('#browserStatus').innerText(),/別の画面/);
 assert.equal(await raw(),latest);await second.close();
 // Storage failures retain the current editable draft and prior saved data.
 const before=await state();
 await page.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}});
 await page.click('#saveBrowser');assert.match(await page.locator('#browserStatus').innerText(),/保存に失敗/);
 assert.deepEqual(await state(),before);assert.equal(await raw(),latest);
 await page.evaluate(()=>Storage.prototype.setItem=window.originalSet);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'evidence/map-browser-save.png',fullPage:true});
 // Invalid existing data remains intact; editor opens a validated initial draft.
 await page.evaluate(k=>localStorage.setItem(k,'{"version":99,"nodes":{}}'),key);
 await page.reload();await ready(page);assert.match(await page.locator('#browserStatus').innerText(),/復元できません/);
 assert.equal(await raw(),'{"version":99,"nodes":{}}');
 assert.equal((await state()).some(e=>e.species==='character-traveler'),false);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/map-browser-save-test.json',JSON.stringify({multiNodeRestore:true,unsavedEditsDiscarded:true,floatPreserved:true,staleTabSaveRejected:true,quotaFailurePreservesDraftAndSave:true,invalidSavePreserved:true,mobileOverflow:false,errors},null,2));
 console.log('Map browser save: multi-node reload, stale tab, quota and invalid storage passed');
}finally{await browser.close()}
