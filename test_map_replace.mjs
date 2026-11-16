import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
const state=()=>p.evaluate(()=>window.mapArt.placements);
try{
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/map-art.html');await p.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await p.locator('#replaceSelected').isDisabled(),true);
 await p.locator('#placements button').first().click();await p.click('#flipSelected');
 const before=await state(),id=await p.evaluate(()=>window.mapArt.selected),original=before.find(e=>e.id===id);
 await p.selectOption('#species','boss-childe-foul');await p.click('#replaceSelected');
 const changed=await state();assert.deepEqual(changed,before.map(e=>e.id===id?{...e,species:'boss-childe-foul'}:e));
 assert.equal(await p.evaluate(()=>window.mapArt.selected),id);
 const visual=await p.evaluate(id=>window.mapArt.visuals.find(e=>e.id===id),id);assert.equal(visual.height,160);assert.equal(visual.hover,32);assert.equal(visual.y,original.y-32);
 await p.click('#undo');assert.deepEqual(await state(),before);
 // Same material is a no-op and must preserve the existing redo branch.
 await p.selectOption('#species',original.species);await p.click('#replaceSelected');assert.deepEqual(await state(),before);assert.equal(await p.locator('#redo').isEnabled(),true);
 await p.fill('#assetSearch','no-matching-material-xyz');await p.click('#replaceSelected');assert.deepEqual(await state(),before);assert.equal(await p.locator('#redo').isEnabled(),true);
 await p.click('#clearAssetSearch');await p.click('#redo');assert.deepEqual(await state(),changed);
 await p.click('#saveBrowser');await p.reload();await p.waitForFunction(()=>window.mapArt?.ready);assert.deepEqual(await state(),changed);
 await p.locator('#placements button').first().click();await p.selectOption('#species','character-traveler');await p.click('#replaceSelected');
 assert.deepEqual((await state()).find(e=>e.id===id),{...original,species:'character-traveler'});
 await p.click('#undo');assert.deepEqual(await state(),changed);
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.locator('#replaceSelected').scrollIntoViewIfNeeded();await p.screenshot({path:'evidence/map-replace-mobile.png'});
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/map-replace-test.json',JSON.stringify({errors,checks:['disabled without selection','replacement preserves ID, position, facing, count and other objects','asset height and hover updated','undo/redo roundtrip','same material and empty filter preserve draft and redo','browser save/reload retains replacement','enemy to boss to character','390px no overflow']},null,2));
 console.log('Material replacement, history, persistence and mobile passed');
}finally{await b.close()}
