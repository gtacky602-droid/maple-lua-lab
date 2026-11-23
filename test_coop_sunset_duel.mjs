import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const prefix='evidence/coop-sunset-duel';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const proof=(JSON.parse(await fs.readFile(prefix+'-lua-http.json','utf8'))).lua;
const [hub,meet,review,arena,rostrum]=['natlan-hub','natlan-duel-entry','natlan-sunset-review',
  'natlan-sunset-arena','natlan-sunset-rostrum'];
const quest='natlan-sunset-duel', boss='original-river-racer';
const key='maple-lua-lab.checkpoint.v1';
const browser=await chromium.launch({channel:'chrome',headless:true});
const players=[];
const errors=new Set();
const frame=page=>page.evaluate(()=>window.lab.frame);
const rewards=f=>[f.progression.questXp,f.mora,f.inventory.upgradeOre];

async function inspect({page,route},x,count,y=480){
  for(let attempt=0;attempt<4;attempt++){
    await route.walk(x);
    await route.changeHeight(y);
    const t=(await frame(page)).t;
    await page.waitForFunction(t=>window.lab.frame.t>t+.05,t);
    if(Math.abs((await route.actor()).x-x)<38) break;
  }
  await page.waitForFunction(x=>{
    const f=window.lab.frame;
    return Math.abs(f.actors[f.active-1].x-x)<49&&f.storyNearbyMilestone;
  },x,{timeout:6000});
  await page.keyboard.press('KeyG');
  await route.count(quest,count);
}

async function fight({page},side,replay){
  await page.evaluate(({side,replay,quest})=>{
    const held=new Set();
    const start=window.lab.frame.t;
    const hold=(code,on)=>{
      if(on===held.has(code)) return;
      on?held.add(code):held.delete(code);
      window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    };
    function tick(){
      const f=window.lab.frame,b=f.fieldBoss,duel=f.storyDuel,a=f.actors[f.active-1];
      const won=replay ? f.storyNotice?.startsWith('練習の勝負が終わりました') : f.story.quests[quest]?.count>=3;
      if(won||f.returns||f.t-start>45){
        for(const code of held) hold(code,false);
        window.duelResult={won,returns:f.returns};
        return;
      }
      const home=975;
      const target=b?.x??home;
      const marks=duel?.marks?.filter(m=>m.state!=='spent')??[];
      const choices=[target+side*63,target-side*63,target+37,target-37];
      const safe=choices.filter(x=>marks.every(m=>Math.abs(m.x-x)>55));
      const goal=(safe.length?safe:choices)[0];
      const dx=goal-a.x,aim=target-a.x;
      const turning=Math.abs(dx)<9&&Math.abs(aim)>4&&a.dir*aim<0;
      hold('KeyA',dx<-9||turning&&aim<0);
      hold('KeyD',dx>9||turning&&aim>0);
      hold('KeyJ',Boolean(b)&&Math.abs(aim)<100&&a.dir*aim>0);
      requestAnimationFrame(tick);
    }
    document.activeElement.blur();
    window.duelResult=null;
    requestAnimationFrame(tick);
  },{side,replay,quest});
}

async function finishFight(replay){
  await Promise.all(players.map((player,i)=>fight(player,i?1:-1,replay)));
  await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.duelResult,undefined,{timeout:80000})));
  for(const {page} of players){
    const result=await page.evaluate(()=>window.duelResult);
    assert.ok(result.won&&!result.returns,JSON.stringify(result));
  }
}

try{
  for(let i=0;i<2;i++){
    const page=await browser.newPage({viewport:{width:1240,height:930}});
    const route=waypointDriver(page,nodes,{walkTimeout:22000});
    page.on('pageerror',err=>errors.add(err.message));
    page.on('response',res=>{if(res.url().endsWith('/api/frame')&&!res.ok())errors.add('Frame HTTP '+res.status())});
    players.push({page,route});
    await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
    await page.waitForFunction(()=>window.lab?.frame);
    await page.locator('#importSave').setInputFiles('work/natlan-sunset-duel-fixture.json');
    await route.waitNode(hub);
    await route.accept(quest);
    await route.cross(meet);
    await page.locator('#coopPanel summary').click();
  }
  const [host,guest]=players;
  await host.page.locator('#coopCreate').click();
  await host.page.waitForFunction(()=>window.lab.frame.coop?.code);
  const code=(await frame(host.page)).coop.code;
  await guest.page.locator('#coopCode').fill(code);
  await guest.page.locator('#coopJoin').click();
  await guest.page.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
  await Promise.all(players.map(async player=>{
    await inspect(player,418,1);
    await player.route.cross(review);
    await inspect(player,801,2,390);
  }));
  await Promise.all(players.map(({route})=>route.cross(arena)));
  const initial=await Promise.all(players.map(({page})=>frame(page)));
  assert.ok(initial.every(f=>f.coop.shared&&f.coop.enemies.some(e=>e.id===95000014&&e.hp===proof.hp)));
  await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.lab.frame.storyDuel?.phase==='out')));
  await Promise.all(players.map(({route})=>route.walk(633)));
  await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.lab.frame.storyDuel?.phase==='splashWarning')));
  const warnings=await Promise.all(players.map(async({page})=>(await frame(page)).storyDuel.marks.map(m=>m.x)));
  assert.deepEqual(warnings[0],warnings[1]);
  await host.page.locator('.game').screenshot({path:prefix+'-splash.png'});
  await finishFight(false);
  console.log('Both profiles cleared the chapter duel');
  const reported=await Promise.all(players.map(async(player,i)=>{
    const {page,route}=player;
    const won=await frame(page);
    assert.equal(won.progression.questXp-initial[i].progression.questXp,proof.chapterFirstClearExp);
    await inspect(player,1408,4);
    await route.cross(rostrum);
    await inspect(player,853,5,390);
    await route.cross(hub);
    const before=rewards(await frame(page));
    await route.report(quest);
    const after=rewards(await frame(page));
    assert.deepEqual(after.map((n,j)=>n-before[j]),proof.reportReward);
    await route.cross(arena);
    return after;
  }));
  await Promise.all(players.map(player=>inspect(player,322,5)));
  await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.lab.frame.storyDuel?.replay&&window.lab.frame.coop?.shared)));
  await finishFight(true);
  console.log('Both profiles finished the shared practice');
  for(const [i,{page,route}] of players.entries()){
    assert.deepEqual(rewards(await frame(page)),reported[i]);
    await page.locator('#saveProgress').click();
    await page.waitForFunction(([key,boss])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[boss]?.clears===1,[key,boss]);
    await page.reload();
    await page.waitForFunction(()=>window.lab?.frame);
    await page.locator('#loadProgress').click();
    await route.waitNode(meet);
    await page.waitForFunction(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
  }
  assert.deepEqual([...errors],[]);
  const result={players:2,sharedHP:proof.hp,sharedCharge:true,lockedSplashMarks:warnings[0],
    bothReportedAndReloaded:true,sharedPracticeWon:true,noDuplicateRewardOrRecord:true,errors:[]};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(result,null,2)+'\n');
  console.log(result);
}catch(error){
  for(const {page} of players) console.dir(await page.evaluate(()=>{
    const f=window.lab?.frame;
    return {node:f?.story?.node,duel:f?.storyDuel,boss:f?.fieldBoss,coop:f?.coop?.shared,
      x:f?.actors[f.active-1].x,y:f?.actors[f.active-1].y,result:window.duelResult,notice:f?.storyNotice};
  }),{depth:2});
  throw error;
}finally{
  await browser.close();
}
