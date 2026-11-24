import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const file='work/cap-fresh-route-draft/lv200-save.json';
const {nodes:graph}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.map(node=>[node.id,node]));
const {matches:{beidou}}=JSON.parse(await fs.readFile('content/stygian-matches.json','utf8'));
const config=JSON.parse(await fs.readFile('content/field-balance-draft.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results={};
const errors=[];

try{
 for(const [profile,url] of [
  ['standard',process.env.STANDARD_LAB_URL||'http://127.0.0.1:9081/'],
  ['draft',process.env.DRAFT_LAB_URL||'http://127.0.0.1:9084/'],
 ]){
  const draft=profile==='draft';
  const page=await browser.newPage({viewport:{width:1240,height:920}});
  page.on('pageerror',error=>errors.push(error.message));
  try{
   const drive=waypointDriver(page,nodes);
   await page.goto(url);
   await page.waitForFunction(()=>window.lab?.frame);
   await page.locator('#importSave').setInputFiles(file);
   await page.waitForFunction(()=>window.lab.frame.progression?.level===200);
   assert.equal(await page.evaluate(()=>Boolean(window.lab.frame.fieldBalance)),draft);
   await drive.warp(beidou.hub);
   await drive.cross(beidou.node);
   const mode=page.locator('#stygianMode'),reward=page.locator('#stygianReward');
   await mode.selectOption('master');
   const master=await reward.textContent();
   assert.match(master,/HP 1,830 ｜/);
   await mode.selectOption('extreme');
   const extreme=await reward.textContent();
   const expected=draft?config.stygianBossHp.beidou.extreme:beidou.modes.find(mode=>mode.id==='extreme').hp;
   assert.ok(extreme.includes(`HP ${expected.toLocaleString('en-US')}${draft?'（比較版）':''} ｜`),extreme);
   if(draft){
    await page.setViewportSize({width:390,height:844});
    const desk=page.locator('#stygianDesk');
    assert.ok(await desk.evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
    await desk.screenshot({path:'evidence/earned-beidou-draft-preview.png'});
   }
   await page.locator('#stygianStart').click();
   await page.waitForFunction(expected=>window.lab.frame.boss?.maxhp===expected&&
    document.getElementById('stygianHp').max===expected,expected,{timeout:10000});
   assert.equal(await page.locator('#stygianHp').getAttribute('max'),String(expected));
   results[profile]={master,extreme,maxHp:expected};
  }catch(error){
   console.error(await page.evaluate(()=>({
    status:document.getElementById('status').textContent,
    match:window.lab?.frame.endgameRun?.match,
    maxHp:window.lab?.frame.boss?.maxhp,
    meter:document.getElementById('stygianHp').max,
   })));
   throw error;
  }finally{
   await page.close();
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/earned-beidou-balance-browser.json',JSON.stringify({...results,errors},null,2)+'\n');
 console.log('Chrome matched Beidou difficulty HP to the battle gauge in both profiles.');
}finally{
 await browser.close();
}
