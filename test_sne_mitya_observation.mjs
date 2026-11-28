import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const quest='sne-mitya-observation',town='snezhnaya-hub',shed='sne-survey-shed';
const yard='sne-survey-yard',ridge='sne-survey-ridge';
const output='work/earned-sne-mitya-footprints';
const checkpoint=process.env.LAB_MITYA_CHECKPOINT;
const prefix=checkpoint?`${output}/survey`:'evidence/sne-survey';
const saveKey='maple-lua-lab.checkpoint.v1';
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

async function questButton(name,status,id=quest){
  await page.locator('[data-quest="'+id+'"]').getByRole('button',{name,exact:true}).click();
  await wait(({id,status})=>window.lab.frame.story.quests[id]?.status===status,{id,status});
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

async function saveReload(node=shed){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  const save=await page.evaluate(key=>localStorage.getItem(key),saveKey);
  await page.reload();
  await wait(()=>window.lab?.frame);
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(node);
  return JSON.parse(save);
}

function assertPrevious(input,saved){
  for(const [id,q] of Object.entries(input.story.quests)){
    if(q.status==='complete')assert.deepEqual(saved.story.quests[id],q,id);
  }
}

async function footprints(input,luarun){
  const id='white-pass-footprints',road='snezhnaya-field',cut='white-pass-cut';
  const ready=JSON.parse(await fs.readFile(`${output}/footprints-ready.json`,'utf8'));
  await page.locator('#importSave').setInputFiles(`${output}/footprints-ready.json`);
  await at(town);
  assert.equal((await frame()).progression.level,145);
  await questButton('受注','active',id);
  await gate(1380,road);
  await gate(865,cut);
  await walk(440);
  assert.equal((await frame()).draws.filter(d=>d.color==='#59758b').length,5);
  await shot('tracks');
  await inspect(440);
  await wait(id=>window.lab.frame.story.quests[id]?.count===1,id);
  await walk(580);
  await ground(480);
  assert.ok(!(await frame()).storyNearbyMilestone);
  await jump(580,382);
  await inspect(580);
  await wait(id=>window.lab.frame.story.quests[id]?.count===2,id);
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const original=await frame();
  assert.ok(original.draws.some(d=>d.text==='安全な回り道'&&d.y===279));
  assert.ok(original.draws.some(d=>d.color==='#c65f51'&&d.x+original.camera===626&&d.y===346));
  await shot('safe-route-png');
  await page.locator('#renderMode').selectOption('h32c16');
  await wait(n=>window.lab.frame.commands>n*5,original.commands);
  const light=await frame();
  const crack=f=>f.draws.filter(d=>['#435872','#59758b'].includes(d.color));
  assert.equal(light.t,original.t);
  assert.deepEqual(crack(light),crack(original));
  await shot('safe-route-light');
  await page.locator('#renderMode').selectOption('sprite');
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  await walk(60);
  await canvas.click();
  await page.keyboard.down('KeyS');
  try{await page.keyboard.press('Space');await ground(480)}finally{await page.keyboard.up('KeyS')}
  await gate(60,road);
  await gate(60,town);
  const before=await frame();
  await questButton('報告','complete',id);
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  assert.deepEqual(reward,luarun.footprintsReward);
  const finished=await saveReload(town);
  assertPrevious(input,finished);
  assertPrevious(ready,finished);
  assert.equal(finished.companion,'mitya');
  assert.equal(finished.progression.level,145);
  await fs.writeFile(`${output}/complete.json`,JSON.stringify(finished)+'\n');
  await gate(1380,road);
  await gate(865,cut);
  const returned=await frame();
  assert.ok(returned.draws.some(d=>d.text==='安全な回り道'));
  return {level:finished.progression.level,reward,safeRouteFlagAfterReload:true,
    footprintAndCrackMatch:true,commands:{png:original.commands,light:light.commands}};
}

try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8908/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile(checkpoint??'work/sne-survey-fixture.json','utf8');
  const input=JSON.parse(seed);
  const lua=JSON.parse(await fs.readFile('evidence/sne-survey-lua.json','utf8'));
  await page.evaluate(({key,seed})=>localStorage.setItem(key,seed),{key:saveKey,seed});
  await page.locator('#loadProgress').click();
  if(checkpoint){
    await at('white-pass-station');
    await gate(52,town);
  }
  await at(town);
  await gate(417,shed);
  const shedScene=await scenery();
  assert.deepEqual(shedScene,{key:'sneSurveyShed',file:'sne-survey-shed-background-v1.png',state:'ready'});
  assert.equal((await frame()).story.quests['white-pass-ticket']?.status,checkpoint?'complete':undefined);
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
  if(checkpoint){
    await saveReload();
    await gate(1039,yard);
    await gate(1316,ridge);
    assert.equal((await frame()).total,0);
    await jump(1405,386);
    await walk(1469);
    await wait(()=>window.lab.frame.storySurveyRig?.label==='脚を長く伸ばす');
  }
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
  const joined=await saveReload();
  assert.equal((await frame()).companion.id,'mitya');
  assert.ok((await frame()).starterEquipment);
  await gate(849,ridge);
  await ground(386);
  await inspect(1469);
  await wait(()=>window.lab.frame.storyNotice?.includes('小さな反応があります'));
  assert.equal((await frame()).draws.filter(d=>d.source==='mitya-idle-source-v2.png').length,1);
  assertPrevious(input,joined);
  const prior=Object.values(input.story.quests).filter(q=>q.status==='complete').length;
  let patrol=null;
  if(checkpoint){
    const record=JSON.parse(await fs.readFile(`${output}/lua.json`,'utf8'));
    patrol=await footprints(input,record);
  }
  assert.deepEqual(errors,[]);
  const proof={shedScene,ridgeScene,firstMeetingBeforeMain:!checkpoint,threeSamples:true,wrongSetupsRejected:true,
    setupRestored:Boolean(checkpoint),joinedAndStarter:true,shortcutAndFixedReadback:true,commands,reward,patrol,
    sourceSha256:createHash('sha256').update(seed).digest('hex'),priorQuests:prior,errors};
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
