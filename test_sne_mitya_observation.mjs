import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='sne-mitya-observation',town='snezhnaya-hub',shed='sne-survey-shed';
const yard='sne-survey-yard',ridge='sne-survey-ridge',prefix='evidence/sne-survey';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,value,timeout=23000)=>page.waitForFunction(fn,value,{timeout});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=(n,timeout)=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n},timeout);
const ground=y=>wait(y=>{const a=window.lab.frame.actors[0];return a.ground&&a.y===y},y);
const shot=name=>page.locator('.game').screenshot({path:prefix+'-'+name+'.png'});

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function walk(x){
  const f=await frame(),a=f.actors[f.active-1],east=x>a.x;
  if(Math.abs(a.x-x)<8)return;
  const dir=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(dir);
  try{
    await wait(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  }finally{await page.keyboard.up(dir)}
}

async function jump(x,y){
  await walk(x);
  await canvas.click();
  await page.keyboard.down('Space');
  try{await ground(y)}finally{await page.keyboard.up('Space')}
}

async function gate(x,node){
  await walk(x);
  await wait(node=>{const p=window.lab.frame.storyNearbyPortal;return p?.available&&p.to===node},node);
  await key('KeyF');
  await at(node);
}

async function inspect(x,n){
  await walk(x);
  await wait(()=>window.lab.frame.storyNearbyMilestone);
  await key('KeyG');
  if(n!==undefined)await count(n);
}

async function questButton(name,status){
  await page.locator('[data-quest="'+quest+'"]').getByRole('button',{name,exact:true}).click();
  await wait(({quest,status})=>window.lab.frame.story.quests[quest]?.status===status,{quest,status});
}

async function scenery(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function compare(){
  await walk(1331);
  await wait(()=>window.lab.frame.actors.every(a=>a.walk===0));
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.draws.filter(d=>d.source==='mitya-idle-source-v2.png').length,1);
  assert.ok(png.draws.some(d=>d.source==='sne-survey-props-source-v1.png'&&d.h===22));
  await shot('fixed-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n*10,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n*.66,standard.commands);
  const light=await frame();
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storySurvey,png.storySurvey);
  }
  await shot('fixed-light');
  await menu.selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function saveReload(){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(shed);
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8908/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile('work/sne-survey-fixture.json','utf8');
  const lua=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await page.locator('#loadProgress').click();
  await at(town);
  await gate(417,shed);
  const shedScene=await scenery();
  assert.deepEqual(shedScene,{key:'sneSurveyShed',file:'sne-survey-shed-background-v1.png',state:'ready'});
  assert.ok(!(await frame()).story.quests['white-pass-ticket']);
  await questButton('受注','active');
  await inspect(311,1);
  await gate(1039,yard);
  await inspect(349,2);
  await inspect(942,3);
  assert.equal((await frame()).storySurvey.samples,2);
  await walk(631);
  await shot('yard');
  await gate(1316,ridge);
  const ridgeScene=await scenery();
  assert.deepEqual(ridgeScene,{key:'sneSurveyRidge',file:'sne-survey-ridge-background-v1.png',state:'ready'});
  await walk(535);
  if(!(await frame()).auto)await page.locator('#auto').click();
  await count(4,60000);
  if((await frame()).auto)await page.locator('#auto').click();
  await wait(()=>!window.lab.frame.auto);
  await jump(549,386);
  await jump(900,291);
  await inspect(1076,5);
  assert.equal((await frame()).storySurvey.samples,3);
  await walk(1405);
  await ground(386);
  await inspect(1405,6);
  await walk(1469);
  const confirm=page.getByRole('button',{name:'この設置で確定する',exact:true});
  await confirm.click();
  await wait(()=>window.lab.frame.storyNotice?.includes('雪壁'));
  await key('KeyG');
  await wait(()=>window.lab.frame.storySurveyRig?.label==='脚を長く伸ばす');
  await confirm.click();
  await wait(()=>window.lab.frame.storyNotice?.includes('揺れる'));
  await count(6);
  await walk(1425);
  await wait(()=>window.lab.frame.storySurveyRig?.label==='脚を長く伸ばす');
  await shot('unstable');
  await key('KeyG');
  await wait(()=>window.lab.frame.storySurveyRig?.ready);
  assert.match(await page.locator('#surveyRigReading').textContent(),/見通し 3\/3 .* 安定 3\/3/);
  await confirm.click();
  await count(7);
  await inspect(1592,8);
  await wait(()=>window.lab.frame.storyNotice?.includes('休憩は後にしよう'));
  const commands=await compare();
  await gate(1656,shed);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  assert.deepEqual(reward,lua.reward);
  await page.getByRole('button',{name:'ミティヤを同行に選ぶ',exact:true}).click();
  await wait(()=>window.lab.frame.companion.id==='mitya'&&window.lab.frame.starterEquipment?.flower.hp===10);
  await saveReload();
  assert.equal((await frame()).companion.id,'mitya');
  assert.ok((await frame()).starterEquipment);
  await gate(849,ridge);
  await ground(386);
  await inspect(1469);
  await wait(()=>window.lab.frame.storyNotice?.includes('小さな反応があります'));
  assert.equal((await frame()).draws.filter(d=>d.source==='mitya-idle-source-v2.png').length,1);
  assert.deepEqual(errors,[]);
  const proof={shedScene,ridgeScene,firstMeetingBeforeMain:true,threeSamples:true,wrongSetupsRejected:true,
    joinedAndStarter:true,shortcutAndFixedReadback:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}catch(error){
  console.error(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story.node,actor:f?.actors[0],notice:f?.storyNotice,portal:f?.storyNearbyPortal,
      milestone:f?.storyNearbyMilestone,survey:f?.storySurvey,rig:f?.storySurveyRig,auto:f?.auto};
  }),errors);
  throw error;
}finally{await browser.close()}
