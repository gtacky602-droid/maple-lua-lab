import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:1024}});
const drive=waypointDriver(page,nodes);
const frame=()=>page.evaluate(()=>window.lab.frame.artifactDomain);
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{
 if(response.url().endsWith('/api/frame')&&!response.ok())errors.push(`Frame HTTP ${response.status()}`);
});
const cases=[
 {id:'ridge-watch',host:'mond-border',path:['sites-lookout-10009','ridge-watch-domain'],
  set:'paleFlame',label:'蒼白の炎'},
 {id:'windcrown',host:'mond-wp-95782',path:['sites-windcrown-waterfall','sites-lookout-98500','windcrown-domain'],
  set:'deepShadow',label:'影に沈む幻'},
];
const results=[];

async function fightAt(x,expectedEnemies){
 await drive.walk(x);
 await page.keyboard.down('KeyJ');
 try{
  await page.waitForFunction(left=>window.lab.frame.artifactDomain?.remainingEnemies===left,expectedEnemies,{timeout:22000});
 }finally{await page.keyboard.up('KeyJ')}
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8989/');
 await page.waitForFunction(()=>window.lab?.frame);
 for(const site of cases){
  await page.locator('#importSave').setInputFiles(`work/${site.id}-domain-fixture.json`);
  const hub=nodes[site.host].checkpoint;
  await drive.waitNode(hub);
  await drive.warp(site.host);
  for(const target of site.path)await drive.cross(target);
  assert.equal((await frame()).status,'ready');
  await page.locator('#artifactDomainRank').selectOption('iv');
  await page.locator('#artifactDomainSet').selectOption(site.set);
  assert.match(await page.locator('#artifactDomainDetails').textContent(),/2体.*★5/);
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('#artifactDomain').evaluate(panel=>panel.scrollWidth>panel.clientWidth),false);
  await page.setViewportSize({width:1280,height:1024});
  await page.locator('#artifactDomainStart').click();
  await page.waitForFunction(()=>window.lab.frame.artifactDomain?.status==='fighting');
  await page.locator('#artifactDomainChoices').waitFor({state:'hidden'});
  assert.equal((await frame()).remainingEnemies,2);
  const before=await page.evaluate(()=>window.lab.frame.inventory.items.length);
  await drive.walk(292);
  await page.locator('#game').screenshot({path:`evidence/${site.id}-domain-battle.png`});
  await fightAt(292,1);
  await fightAt(1000,0);
  await page.locator('#artifactDomainResult').waitFor();
  assert.match(await page.locator('#artifactDomainResult').textContent(),new RegExp(site.label+'の花'));
  assert.equal(await page.evaluate(()=>window.lab.frame.inventory.items.length),before+1);
  const reward=(await frame()).result;
  await page.locator('#artifactDomain').screenshot({path:`evidence/${site.id}-domain-clear.png`});
  await page.locator('#saveProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.startsWith('冒険を保存しました'));
  await page.locator('#loadProgress').click();
  await drive.waitNode(hub);
  await page.waitForFunction(([id,set])=>{
   const f=window.lab.frame;
   return f.endgame?.artifactDomains?.[id+':iv']?.clears===1&&f.inventory.items.some(item=>item.setId===set);
  },[site.id,site.set]);
  await page.locator('#artifactDomain').waitFor({state:'hidden'});
  results.push({id:site.id,ranks:4,cleared:'iv',manualAttack:true,reward,restoredAt:hub});
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/artifact-domains-browser.json',JSON.stringify({results,journeys:drive.journeys,mobileWidth:390,errors},null,2)+'\n');
 console.log('Two domain routes and Grade IV playthroughs passed in Chrome');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story?.node,view:window.lab?.frame.artifactDomain,
  x:window.lab?.frame.actors?.[0]?.x,notice:window.lab?.frame.storyNotice,status:document.querySelector('#status').textContent})));
 throw error;
}finally{await browser.close()}
