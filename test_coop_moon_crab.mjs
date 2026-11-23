import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const prefix='evidence/coop-moon-crab';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const expected=JSON.parse(await fs.readFile(prefix+'-lua-http.json','utf8')).lua;
const town='nod-town', mouth='nod-moon-cave-mouth', arena='nod-moon-crab-arena', vault='nod-moon-vault';
const quest='nod-moon-vault-quest', boss='original-moon-crab';
const savedKey='maple-lua-lab.checkpoint.v1';
const browser=await chromium.launch({channel:'chrome',headless:true});
const players=[];
const errors=new Set();
const frame=page=>page.evaluate(()=>window.lab.frame);
const save=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),savedKey);

async function inspect({page,route},x,count){
  for(let attempt=0;attempt<4;attempt++){
    await route.walk(x);
    const t=(await frame(page)).t;
    await page.waitForFunction(t=>window.lab.frame.t>t+.05,t);
    if(Math.abs((await route.actor()).x-x)<44) break;
  }
  await page.waitForFunction(x=>{
    const f=window.lab.frame;
    return Math.abs(f.actors[f.active-1].x-x)<49&&f.storyNearbyMilestone;
  },x,{timeout:5000});
  await page.keyboard.press('KeyG');
  await route.count(quest,count);
}

async function fight(page,side){
  await page.evaluate(({side,quest})=>{
    const held=new Set();
    const start=window.lab.frame.t;
    const hold=(code,on)=>{
      if (on===held.has(code)) return;
      on ? held.add(code) : held.delete(code);
      window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    };
    const casts=new Set();
    function tick(){
      const f=window.lab.frame, b=f.fieldBoss, a=f.actors[f.active-1];
      const won=f.story.quests[quest]?.count>=2;
      if (won||!b||f.returns||f.t-start>100){
        for (const code of held) hold(code,false);
        window.crabResult={won,returns:f.returns,seconds:f.t-start,casts:[...casts]};
        return;
      }
      if (b.move) casts.add(b.move);
      const choices=[b.x+side*72,b.x-side*72,b.x+side*34,b.x-side*34];
      const lane=b.lane;
      if (lane) choices.push(lane.left-27,lane.right+27);
      const safe=choices.filter(x=>!lane||x<lane.left-16||x>lane.right+16);
      const cost=x=>Math.abs(a.x-x)+.8*Math.abs(x-(b.x+side*72));
      safe.sort((x,y)=>cost(x)-cost(y));
      const dx=(safe[0]??b.x)-a.x, aim=b.x-a.x;
      const turning=Math.abs(dx)<=8&&Math.abs(aim)>5&&aim*a.dir<0;
      hold('KeyA',dx<-8||turning&&aim<0);
      hold('KeyD',dx>8||turning&&aim>0);
      hold('KeyJ',Math.abs(aim)<106&&aim*a.dir>0);
      requestAnimationFrame(tick);
    }
    document.activeElement.blur();
    requestAnimationFrame(tick);
  },{side,quest});
}

try{
  for (let i=0;i<2;i++){
    const page=await browser.newPage({viewport:{width:1240,height:930}});
    page.on('pageerror',err=>errors.add(err.message));
    page.on('response',res=>{
      if (res.url().endsWith('/api/frame')&&!res.ok()) errors.add('Frame HTTP '+res.status());
    });
    const route=waypointDriver(page,nodes,{walkTimeout:22000});
    players.push({page,route});
    await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
    await page.waitForFunction(()=>window.lab?.frame);
    await page.locator('#importSave').setInputFiles('work/nod-moon-vault-fixture.json');
    await route.waitNode(town);
    await route.accept(quest);
  }
  const [host,guest]=players;
  await Promise.all(players.map(({route})=>route.cross(mouth)));
  await Promise.all(players.map(({page})=>page.locator('#coopPanel summary').click()));
  await host.page.locator('#coopCreate').click();
  await host.page.waitForFunction(()=>window.lab.frame.coop?.code);
  const code=(await frame(host.page)).coop.code;
  await guest.page.locator('#coopCode').fill(code);
  await guest.page.locator('#coopJoin').click();
  await guest.page.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
  await inspect(host,1080,1);
  await host.route.cross(arena);
  await guest.route.walk(1260);
  await guest.page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.available===false);
  await guest.page.keyboard.press('KeyF');
  assert.equal(await guest.route.node(),mouth);
  await inspect(guest,1080,1);
  await guest.route.cross(arena);
  const initial=await Promise.all(players.map(({page})=>frame(page)));
  assert.ok(initial.every(f=>f.coop.shared&&f.coop.enemies.some(e=>e.id===95000015&&e.hp===expected.hp&&e.maxhp===expected.hp)));

  await Promise.all(players.map(({route})=>route.walk(713)));
  await host.page.waitForFunction(()=>window.lab.frame.fieldBoss?.move==='claw');
  await host.page.locator('.game').screenshot({path:prefix+'-claw.png'});
  await Promise.all(players.map(({page},i)=>fight(page,i?1:-1)));
  await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.lab.frame.fieldBoss?.cracked)));
  await host.page.locator('.game').screenshot({path:prefix+'-cracked.png'});
  await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.crabResult,undefined,{timeout:140000})));
  const clears=await Promise.all(players.map(async({page},i)=>{
    const result=await page.evaluate(()=>window.crabResult);
    assert.ok(result.won&&!result.returns,JSON.stringify(result));
    const f=await frame(page);
    assert.ok(f.events.some(event=>event.kind==='hit'&&event.target===95000015));
    assert.equal(f.coop.shared,false);
    assert.equal(f.storyFirstClear?.xp,expected.chapterExp);
    assert.equal(f.progression.questXp-initial[i].progression.questXp,expected.chapterExp);
    assert.equal(f.progression.killXp-initial[i].progression.killXp,expected.expPerContributor);
    assert.equal(f.mora-initial[i].mora,expected.moraPerContributor);
    return result;
  }));

  const choices=['feather','flower'];
  await Promise.all(players.map(async (player,i)=>{
    await player.route.cross(vault);
    if (i===0){
      await player.route.cross(arena);
      const f=await frame(player.page);
      assert.equal(f.coop.code,code);
      assert.equal(f.coop.shared,false);
      assert.equal(f.fieldBoss,undefined);
      await player.route.cross(vault);
    }
    await inspect(player,416,3);
    const before=await frame(player.page);
    await inspect(player,i?803:657,4);
    const after=await frame(player.page);
    assert.equal(after.story.quests[quest].storyChoice,choices[i]);
    assert.equal(after.mora-before.mora,14500);
    assert.equal(after.inventory.upgradeOre-before.inventory.upgradeOre,8);
    await player.route.cross(town);
    await player.route.report(quest);
    assert.equal((await frame(player.page)).progression.questXp-after.progression.questXp,expected.reportExp);
    await player.page.locator('#saveProgress').click();
    await player.page.waitForFunction(([key,id])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[id]?.clears===1,[savedKey,boss]);
    assert.equal((await save(player.page)).story.quests[quest].storyChoice,choices[i]);
    await player.page.reload();
    await player.page.waitForFunction(()=>window.lab?.frame);
    await player.page.locator('#loadProgress').click();
    await player.route.waitNode(town);
    await player.page.waitForFunction(([quest,choice])=>{
      const q=window.lab.frame.story.quests[quest];
      return q?.status==='complete'&&q.storyChoice===choice;
    },[quest,choices[i]]);
  }));
  assert.deepEqual([...errors],[]);
  const result={players:2,sharedHP:expected.hp,personalEntry:true,bothSawCrackedForm:true,clears,
    choices,preReportReturnIsPrivate:true,personalRewardsAndReload:true,errors:[]};
  await fs.writeFile(prefix+'-browser.json',JSON.stringify(result,null,2)+'\n');
  console.log(result);
}catch(error){
  for (const {page} of players) console.dir(await page.evaluate(()=>{
    const f=window.lab?.frame;
    const a=f?.actors[f.active-1];
    return {node:f?.story?.node,boss:f?.fieldBoss,x:a?.x,y:a?.y,hp:a?.hp,result:window.crabResult,notice:f?.storyNotice};
  }),{depth:2});
  throw error;
}finally{
  await browser.close();
}
