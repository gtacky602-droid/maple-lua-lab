import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph = JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes = Object.fromEntries(graph.nodes.map(node => [node.id,node]));
const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1280,height:1010}});
const drive = waypointDriver(page,nodes);
const url = process.env.LAB_URL||'http://127.0.0.1:9101/';
const quest = 'battleship-commission';
const source = 'battleship-field-poses-source-v1.png';
const errors=[];
page.on('pageerror',error => errors.push(error.message));

const scene = () => page.evaluate(() => {
 const f=window.lab.frame;
 return {boss:f.fieldBoss,actor:f.actors[f.active-1],t:f.t,commands:f.commands,kills:f.kills,mora:f.mora};
});
async function pause(value) {
 await page.evaluate(() => document.activeElement.blur());
 await page.keyboard.press('KeyP');
 await page.waitForFunction(want => window.lab.frame.paused===want,value);
}

try {
 await page.goto(url);
 assert.equal((await (await page.request.get(new URL('/api/lab-info',url).href)).json()).draftFieldMoves,true);
 await page.waitForFunction(() => window.lab?.frame,undefined,{timeout:90000});
 await page.locator('#importSave').setInputFiles('work/earned-battleship-ready.json');
 await drive.waitNode('nod-town');
 await page.waitForFunction(() => window.lab.frame.progression?.level===128);
 await drive.accept(quest);
 await drive.cross('nod-field');
 await drive.cross('nod-battleship-depot');
 await drive.walk(842);

 await page.waitForFunction(() => !!window.lab.frame.fieldBoss?.coolingPlate);
 await pause(true);
 const opening=await scene();
 assert.equal(opening.boss.maxhp,4500000);
 assert.ok(opening.boss.draftMoves && !opening.boss.thermal && opening.boss.coolingPlate);
 assert.equal(opening.boss.coolingPlate.maxLayers,5);
 const {left,right}=opening.boss.coolingPlate;
 await page.locator('#fieldBossLabel').filter({hasText:'冷却板'}).waitFor();

 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await page.waitForFunction(file => !window.lab.frame.draws.some(draw => draw.source===file),source);
 const standard=await scene();
 await page.locator('.game').screenshot({path:'evidence/short-battleship-plate.png'});
 await page.locator('#renderMode').selectOption('h32c16');
 await page.waitForFunction(n => window.lab.frame.commands<n*.65,standard.commands);
 const light=await scene();
 assert.equal(standard.t,light.t);
 await page.locator('.game').screenshot({path:'evidence/short-battleship-plate-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await pause(false);

 await drive.walk((left+right)/2-56);
 await page.keyboard.down('KeyD');
 try{await page.waitForFunction(() => window.lab.frame.actors[0].dir===1);}
 finally{await page.keyboard.up('KeyD')}
 for(let turn=0;turn<10;turn++){
  const at=await scene();
  if(at.boss.form==='down')break;
  assert.ok(at.boss.tick<300 && at.boss.coolingPlate,JSON.stringify(at.boss));
  await page.keyboard.press(['Digit1','Digit2','Digit3'][turn%3]);
  await page.keyboard.down('KeyJ');
  try{
   await page.waitForFunction(t => {
    const f=window.lab.frame;
    return f.t>=t+.36 || f.fieldBoss?.form==='down';
   },at.t);
  }finally{await page.keyboard.up('KeyJ')}
 }
 const down=await scene();
 assert.equal(down.boss.form,'down');
 assert.ok(down.boss.tick<=300 && !down.boss.coolingPlate && down.boss.hp<opening.boss.hp);
 assert.equal(down.kills,opening.kills);
 assert.equal(down.mora,opening.mora);
 await page.locator('#fieldBossLabel').filter({hasText:'冷却板を破壊・反撃の隙'}).waitFor();
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/draft-battleship-moves-browser.json',JSON.stringify({
  level:128,plateInitially:opening.boss.coolingPlate.layers,interruptedBy:down.boss.tick,
  ordinaryKillCountersUnchanged:true,sameFrameCommands:{standard:standard.commands,light:light.commands},errors,
 },null,2)+'\n');
 console.log('Chrome: natural cooling, five-layer board, player interruption and render comparison passed.');
}catch(error){
 console.error(await page.locator('#status').textContent(),errors,await scene().catch(() => null));
 throw error;
}finally{
 await browser.close();
}
