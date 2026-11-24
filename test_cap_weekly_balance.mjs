import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const file='work/cap-fresh-route-draft/lv200-save.json';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const config=JSON.parse(await fs.readFile('content/field-balance-draft.json','utf8'));
const id=process.env.WEEKLY_BALANCE_BOSS||'boss-29020101';
const {weeklyBosses}=JSON.parse(await fs.readFile('content/weekly-boss-spawns.json','utf8'));
const selected=weeklyBosses.find(spec=>spec.id===id);
assert.ok(selected&&config.weeklyBossHp[id],`No weekly HP comparison settings for ${id}`);
const arena=selected.node;
const origin=graph.nodes.find(node=>node.exits.some(gate=>gate.to===arena));
const artifactPrefix=id==='boss-29020101'?'cap-weekly':`cap-weekly-${id}`;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[], results={};
const hpLabel=(hp,draft)=>`HP ${hp.toLocaleString('en-US')}${draft?'（比較版）':''} ｜`;

try{
 for(const [profile,url] of [
  ['standard',process.env.STANDARD_LAB_URL||'http://127.0.0.1:9081/'],
  ['draft',process.env.DRAFT_LAB_URL||'http://127.0.0.1:9083/'],
 ]){
  const draft=profile==='draft';
  const expected=draft?config.weeklyBossHp[id].expert:selected.hp;
  const page=await browser.newPage({viewport:{width:1240,height:920}});
  page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(url);
   await page.waitForFunction(()=>window.lab?.frame);
   await page.locator('#importSave').setInputFiles(file);
   await page.waitForFunction(()=>window.lab.frame.progression?.level===200);
   assert.equal(await page.evaluate(()=>Boolean(window.lab.frame.fieldBalance)),draft);
   const drive=waypointDriver(page,nodes);
   await drive.warp(origin.checkpoint);
   if(origin.id!==origin.checkpoint)await drive.cross(origin.id);
   await drive.walk(origin.exits.find(gate=>gate.to===arena).x);
   await page.locator('#weeklyDesk').waitFor();
   const select=page.locator('#weeklyDifficulty');
   const detail=page.locator('#weeklyChallengeDetails');
   const entry=await detail.textContent();
   assert.ok(entry.includes(hpLabel(selected.hp,false)),entry);
   await select.selectOption('expert');
   const expert=await detail.textContent();
   assert.ok(expert.includes(hpLabel(expected,draft)),expert);
   assert.match(expert,/必要Lv180.*初回追加/);
   if(draft)await page.locator('#weeklyDesk').screenshot({path:`evidence/${artifactPrefix}-draft-preview.png`});
   await page.locator('#weeklyChallengeStart').click();
   await drive.waitNode(arena);
   await page.waitForFunction(expected=>window.lab.frame.weeklyBoss?.maxhp===expected,expected);
   assert.equal(await page.locator('#fieldBossHp').getAttribute('max'),String(expected));
   results[profile]={entry,expert,maxHp:expected};
  }finally{
   await page.close();
  }
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(`evidence/${artifactPrefix}-balance-browser.json`,JSON.stringify({...results,errors},null,2)+'\n');
 console.log('Chrome matched the weekly portal preview to the HP bar in both profiles.');
}finally{
 await browser.close();
}
