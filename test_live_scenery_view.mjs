import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const stage='sites-hunt-7111-pocket-2';
const base=new URL(process.env.LAB_URL || 'http://127.0.0.1:9101/');
const saved=JSON.stringify({version:1,nodes:{[stage]:[{id:'user-draft',species:'hilichurl',x:300,y:480,flip:true}]}});
const storageKey='maple-lua-lab.map-draft.v1';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1420,height:1000}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base.href);
  await page.evaluate(([key,value])=>localStorage.setItem(key,value),[storageKey,saved]);
  const link=new URL('map-art.html',base);
  link.search=new URLSearchParams({node:stage,placements:'live',compare:'background',tier:'4096'});
  await page.goto(link.href);
  await page.waitForFunction(()=>window.mapArt?.decodedBackgroundRectangles===4096);
  const view=await page.evaluate(()=>window.mapArt);
  assert.equal(view.liveView,true);
  assert.equal(view.count,1);
  assert.equal(view.placements[0].id,stage+'-guardian');
  assert.equal(view.placements[0].species,'hilichurl');
  assert.ok(view.placements[0].x-view.camera>0 && view.placements[0].x-view.camera<960);
  assert.equal(await page.locator('#draftControls').isVisible(),false);
  await page.locator('#png').click({position:{x:100,y:100}});
  assert.equal(await page.evaluate(()=>window.mapArt.count),1);
  await page.locator('main').screenshot({path:'evidence/mond-quiet-lookout-4096.png'});
  const [editor]=await Promise.all([page.waitForEvent('popup'),page.locator('#placementViewLink').click()]);
  await editor.waitForFunction(()=>window.mapArt?.ready);
  const draft=await editor.evaluate(()=>window.mapArt);
  assert.equal(draft.liveView,false);
  assert.equal(draft.placements[0].id,'user-draft');
  assert.equal(await editor.evaluate(key=>localStorage.getItem(key),storageKey),saved);
  await page.selectOption('#node','sites-hunt-7092');
  await page.waitForFunction(()=>window.mapArt?.node==='sites-hunt-7092' && window.mapArt.decodedBackgroundRectangles===4096);
  assert.equal(await page.evaluate(()=>window.mapArt.count),36);
  assert.deepEqual(errors,[]);
  await fs.writeFile('evidence/live-scenery-view.json',JSON.stringify({
    room:stage,viewedEnemy:view.placements[0],camera:view.camera,tier:view.decodedBackgroundRectangles,
    editorPlacement:draft.placements[0],secondFieldPopulation:36,unchangedSavedDraft:true,errors,
  },null,2)+'\n');
  console.log('Live scenery comparison opened on the guardian, changed fields and preserved the saved draft.');
} finally { await browser.close(); }
