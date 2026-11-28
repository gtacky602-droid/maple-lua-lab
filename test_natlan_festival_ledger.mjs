import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {captureFrozenStage} from './tools/frozen-stage-capture.mjs';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const checkpoint=process.env.LAB_FESTIVAL_CHECKPOINT;
const prefix=process.env.LAB_FESTIVAL_OUTPUT||'evidence/natlan-festival';
const raw=checkpoint?await fs.readFile(checkpoint):null;
const earned=raw?JSON.parse(raw.toString('utf8')):null;
const destination=earned?'natlan-iansan-training':'natlan-xilonen-course';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1120,height:900}});
const errors=[];
const labels=[];
page.on('pageerror',e=>errors.push(e.message));
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:30000});
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9118/');
 await wait(()=>window.lab?.frame);
 const scenarios=earned?[[checkpoint,7]]:[['evidence/natlan-after-fontaine-save.json',5],['evidence/natlan-revisit-save.json',7]];
 for(const [file,n] of scenarios){
  await page.locator('#importSave').setInputFiles(file);
  await wait(node=>window.lab.frame.story?.node===node&&document.querySelector('#saveStatus').textContent.includes('再開'),
   earned?'natlan-hub':'nod-town');
  if(earned){
   const {nodes}=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
   await waypointDriver(page,Object.fromEntries(nodes.map(node=>[node.id,node]))).cross('natlan-sunset-rostrum');
  }else await page.evaluate(()=>window.lab.action('story_fast:natlan-sunset-rostrum'));
  await wait(()=>window.lab.frame.story.node==='natlan-sunset-rostrum');
  const x=await page.evaluate(()=>{const f=window.lab.frame;return f.actors[f.active-1].x});
  const right=x<847,key=right?'KeyD':'KeyA';
  await page.locator('#game').click();
  await page.keyboard.down(key);
  try{await wait(right=>{const f=window.lab.frame,x=f.actors[f.active-1].x;return right?x>=840:x<=854},right)}
  finally{await page.keyboard.up(key)}
  await page.keyboard.down('Space');
  try{await wait(()=>{const f=window.lab.frame,a=f.actors[f.active-1];return a.ground&&a.y===390&&f.storyFestivalLedger})}
  finally{await page.keyboard.up('Space')}
  await wait(n=>document.querySelectorAll('#festivalLedger dt').length===n,n);
  if(n===7){
   await page.selectOption('#renderMode','h32c16');
   await wait(()=>window.lab.frame.draws.some(d=>d.kind==='rect_runs'));
   const panel=page.locator('#festivalLedger'),ledger=await panel.textContent();
   assert.match(ledger,/高い型 → 低い型 → 高い型/);
   const log=earned?.story.quests['natlan-iansan-self-test'].trainingLog;
   assert.match(ledger,new RegExp(`被弾${log?.baseline.hits??2}回.*被弾${log?.retest.hits??1}回`));
   labels.push(...await panel.locator('dt').allTextContents());
   assert.deepEqual(labels,['尾根の旗取り','夕映えの模擬戦','カチーナと作った石飾り','ムアラニの波札',
    'キィニチと開いた狩道','シロネンの踏み台','イアンサの稽古']);
   await panel.screenshot({path:prefix+'-ledger.png'});
   if(!earned)await captureFrozenStage(page,'natlan-podium-frame');
   await page.setViewportSize({width:390,height:844});
   assert.ok(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth));
   await panel.getByRole('button',{name:earned?'イアンサの稽古':'シロネンの踏み台'}).click();
   await wait(id=>window.lab.frame.worldMap?.selected?.id===id,destination);
  }
 }
 assert.deepEqual(errors,[]);
 const proof={earnedLevel:earned?.progression.level??120,records:scenarios.map(([,n])=>n),
  packed:true,mobileWidth:390,destination,errors};
 if(earned){
  proof.labels=labels;
  proof.sourceSha256=createHash('sha256').update(raw).digest('hex');
 }
 await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
 console.log(proof);
}catch(error){
 console.error(await page.evaluate(()=>{const f=window.lab?.frame;return {node:f?.story?.node,x:f?.actors[f.active-1].x,y:f?.actors[f.active-1].y,status:document.querySelector('#status')?.textContent}}));
 throw error;
}finally{await browser.close()}
