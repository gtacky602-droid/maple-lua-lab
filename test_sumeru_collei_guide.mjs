import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const hub='sumeru-hub',mond='mond-town',trail='sum-collei-trail',fork='sum-collei-rainfork',welcome='sum-collei-welcome';
const earned=process.argv.includes('--earned');
const quest='sum-collei-guide',prefix='evidence/sum-collei-guide';
const output=earned?'work/earned-sumeru-dendro-matrix/collei':prefix;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const canvas=page.locator('#game'),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:24000});
const at=node=>wait(node=>window.lab?.frame?.story?.node===node,node);
const count=n=>wait(({quest,n})=>window.lab.frame.story.quests[quest]?.count===n,{quest,n});
const notice=text=>wait(text=>window.lab.frame.storyNotice?.includes(text),text);
const shot=name=>page.locator('.game').screenshot({path:output+'-'+name+'.png'});

async function key(code){
  await canvas.click();
  await page.keyboard.press(code);
}

async function held(code,fn){
  await canvas.click();
  await page.keyboard.down(code);
  try{return await fn()}finally{await page.keyboard.up(code)}
}

async function walk(x){
  const f=await frame(),player=f.actors[f.active-1],right=x>player.x;
  if(Math.abs(player.x-x)<8)return;
  await held(right?'KeyD':'KeyA',()=>wait(({x,right})=>{
    const f=window.lab.frame,player=f.actors[f.active-1];
    return right?player.x>=x-7:player.x<=x+7;
  },{x,right}));
}

async function jump(y){
  await held('Space',()=>wait(y=>{
    const f=window.lab.frame,a=f.actors[f.active-1];
    return a.ground&&a.y===y;
  },y));
}

async function gate(x,node,label){
  await walk(x);
  await wait(({node,label})=>{
    const p=window.lab.frame.storyNearbyPortal;
    return p?.to===node&&p.available&&(!label||p.name===label);
  },{node,label});
  await key('KeyF');
  await at(node);
}

async function interact(x,expected){
  await walk(x);
  await wait(expected=>window.lab.frame.storyNearbyMilestone?.label===expected,expected);
  await key('KeyG');
}

async function questButton(name,status){
  await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name,exact:true}).click();
  await wait(({quest,status})=>window.lab.frame.story.quests[quest]?.status===status,{quest,status});
}

async function load(node){
  await page.locator('#loadProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('保存した進行で町から再開しました'));
  await at(node);
}

async function reload(node){
  await page.locator('#saveProgress').click();
  await wait(()=>document.querySelector('#saveStatus').textContent.includes('冒険を保存しました'));
  await page.reload();
  await wait(()=>window.lab?.frame);
  await load(node);
}

async function scene(){
  return page.evaluate(async()=>{
    const {backgroundReady,sceneryStatus}=await import('./scenery.js');
    await backgroundReady;
    return sceneryStatus(window.lab.frame);
  });
}

async function compare(){
  await key('KeyP');
  await wait(()=>window.lab.frame.paused);
  const png=await frame();
  assert.equal(png.storyColleiGuide.rain,true);
  assert.equal(png.draws.filter(d=>d.source==='sum-collei-guide-props-source-v1.png').length,2);
  await shot('rain-png');
  const menu=page.locator('#renderMode');
  await menu.selectOption('rect');
  await wait(n=>window.lab.frame.commands>n,png.commands);
  const standard=await frame();
  await menu.selectOption('h32c16');
  await wait(n=>window.lab.frame.commands<n,standard.commands);
  const light=await frame();
  await shot('rain-light');
  for(const f of [standard,light]){
    assert.equal(f.t,png.t);
    assert.deepEqual(f.storyColleiGuide,png.storyColleiGuide);
    assert.deepEqual(f.story.quests[quest],png.story.quests[quest]);
  }
  await menu.selectOption('sprite');
  await wait(n=>window.lab.frame.commands===n,png.commands);
  await key('KeyP');
  await wait(()=>!window.lab.frame.paused);
  return {png:png.commands,standard:standard.commands,light:light.commands};
}

async function run(){
  const expected=JSON.parse(await fs.readFile(prefix+'-lua.json','utf8'));
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8918/');
  await wait(()=>window.lab?.frame);
  const seed=await fs.readFile(earned?output+'-ready.json':'work/sum-collei-guide-fixture.json','utf8');
  await page.evaluate(seed=>localStorage.setItem('maple-lua-lab.checkpoint.v1',seed),seed);
  await load(hub);
  if(earned){
    const current=await frame();
    assert.equal(current.progression.level,69);
    assert.equal(current.story.quests['dendro-hypostasis-commission'].status,'complete');
  }
  await questButton('受注','active');
  await page.locator(`[data-quest="${quest}"]`).getByRole('button',{name:'この依頼を追跡'}).click();
  await interact(515,'コレイの案内の練習に付き合う');
  await count(1);
  await gate(528,trail);
  const practice=await scene();
  assert.deepEqual(practice,{key:'sumeruColleiTrail',file:'sum-collei-guide-trail-background-v1.png',state:'ready'});
  await walk(647);
  const selector=page.locator('#trackedWorksite');
  const hint=page.locator('#trackedHuntHint');
  await selector.selectOption({index:2});
  await hint.filter({hasText:/三つ石.*今いる足場の上/}).waitFor();
  const survey=page.locator('#trackedSurveyPoint');
  const [preview]=await Promise.all([page.waitForEvent('popup'),survey.click()]);
  await preview.waitForFunction(()=>window.mapArt?.ready&&mapArt.backgroundState==='ready');
  assert.match(await preview.locator('#surveyPointNote').innerText(),/高い棚の三つ石.*647, 396/);
  assert.equal(await preview.locator('#profile').inputValue(),'h32c16');
  await preview.locator('#rect').screenshot({path:output+'-stones-field-16.png'});
  await preview.close();
  await jump(396);
  await interact(647,'三つ石を目印に選ぶ');
  await notice('分けにくかった');
  await count(1);
  assert.equal(await selector.evaluate(el=>el.selectedIndex),2);
  await selector.selectOption({index:1});
  await hint.filter({hasText:/青い色糸.*左手・下段/}).waitFor();
  assert.equal(new URL(await survey.getAttribute('href'),page.url()).searchParams.get('choice'),'1');
  assert.match(await page.locator('#storyForest').textContent(),/分けにくかった/);
  await shot('markers');
  await interact(441,'青い色糸を目印に選ぶ');
  await count(2);
  await walk(864);
  await jump(390);
  await interact(864,'川辺の腰掛けで休む');
  await notice('雨宿りできる');
  await count(2);
  await interact(982,'屋根の下で休む');
  await count(3);
  await shot('rest');
  await gate(1384,fork);
  const rain=await scene();
  assert.deepEqual(rain,{key:'sumeruColleiRain',file:'sum-collei-guide-rain-background-v1.png',state:'ready'});
  await interact(331,'コレイと雨の様子を確かめる');
  await count(4);
  await walk(506);
  await jump(389);
  await interact(506,'川沿いの予定道を確かめる');
  await notice('水が柵');
  await count(4);
  assert.equal((await frame()).storyNearbyPortal.available,false);
  await key('KeyF');
  await notice('増水');
  assert.equal((await frame()).story.node,fork);
  await walk(452);
  const commands=await compare();
  await interact(802,'根の下を通る迂回路を選ぶ');
  await count(5);
  await gate(1272,welcome,'根の下の迂回路');
  const gathering=await scene();
  assert.deepEqual(gathering,{key:'sumeruColleiWelcome',file:'sum-collei-guide-welcome-background-v1.png',state:'ready'});
  await interact(512,'コレイと新人の案内を始める');
  await count(6);
  await wait(()=>window.lab.frame.storyColleiGuide?.guestX>610);
  await shot('welcome');
  await gate(965,hub);
  const before=await frame();
  await questButton('報告','complete');
  const after=await frame();
  const reward=[after.progression.questXp-before.progression.questXp,after.mora-before.mora];
  assert.deepEqual(reward,expected.reward);
  assert.equal(after.story.quests[quest].colleiLetter,undefined);
  await reload(hub);
  if(earned){
    const restored=await frame();
    assert.equal(restored.progression.level,70);
    assert.equal(restored.story.quests[quest].status,'complete');
    assert.equal(restored.story.quests[quest].cycles,1);
    assert.equal(restored.story.quests['dendro-hypostasis-commission'].status,'complete');
    assert.equal(restored.returns,0);
    assert.deepEqual(errors,[]);
    const proof={browser:'Chrome',startLevel:69,finishLevel:70,rainClosesOriginalRoute:true,
      detourReachedWelcome:true,restoredReport:true,commands,reward,errors};
    await fs.writeFile('evidence/earned-sumeru-collei-browser.json',JSON.stringify(proof,null,2)+'\n');
    console.log(proof);
    return;
  }
  await page.locator(`[data-rest-waypoint="${trail}"]`).click();
  await at(trail);
  assert.equal((await frame()).storyColleiGuide.rest,true);
  await key('KeyG');
  await notice('ひと休み');
  await gate(1384,fork);
  assert.equal((await frame()).storyColleiGuide.rain,false);
  await walk(549);
  await jump(389);
  await gate(553,welcome,'川沿いの近道');
  await gate(965,hub);
  await interact(748,'アンバーへの手紙を預かる');
  await notice('手紙を預かりました');
  await reload(hub);
  assert.equal((await frame()).story.quests[quest].colleiLetter,'held');
  await page.getByRole('button',{name:'拠点へ：モンド・城門広場',exact:true}).click();
  await at(mond);
  await interact(232,'アンバーに手紙を渡す');
  await notice('アンバーに手紙を渡しました');
  assert.match(await page.locator('#storyForest').textContent(),/アンバーに手紙を渡しました/);
  await shot('letter');
  await reload(mond);
  await interact(232,'アンバーの返事を聞き返す');
  await notice('何度も読んだよ');
  const end=await frame();
  assert.equal(end.story.quests[quest].colleiLetter,'delivered');
  assert.equal(end.kills,0);
  assert.equal(end.mora,after.mora);
  assert.equal(end.progression.questXp,after.progression.questXp);
  assert.deepEqual(errors,[]);
  const proof={scenes:[practice,rain,gathering],wrongChoicesThenSuccess:true,rainClosesOriginalRoute:true,
    realJumps:true,movingGuest:true,reportedBeforeLetter:true,restAndShortcutAfterReload:true,
    optionalLetterAcrossRegionsAndReload:true,commands,reward,errors};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(proof,null,2)+'\n');
  console.log(proof);
}

try{
  await run();
}catch(error){
  console.error(await page.evaluate(quest=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,actor:f?.actors?.[0],notice:f?.storyNotice,
      nearby:f?.storyNearbyMilestone,portal:f?.storyNearbyPortal,guide:f?.storyColleiGuide,quest:f?.story?.quests[quest]};
  },quest));
  throw error;
}finally{
  await browser.close();
}
