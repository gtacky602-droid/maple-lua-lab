import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const graph=await read('content/story-graph.json');
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const specs=(await read('content/field-boss-spawns.json')).fieldBosses;
const prefix=process.argv[2]==='chapters'?'evidence/coop-chapter-guardians':'evidence/coop-ruin-guardians';
const tests=await read(prefix+'-lua-http.json');
const saveKey='maple-lua-lab.checkpoint.v1';
const hallwayEnemies={
  'tunigi-elite-passage':[[392,480],[908,390]],
  'sumeru-observatory-approach':[[277,480],[771,390],[1372,391]],
  'fontaine-grand-stage-approach':[[990,391],[1342,480]],
};
const browser=await chromium.launch({channel:'chrome',headless:true});
const frame=page=>page.evaluate(()=>window.lab.frame);
const results={};
const errors=new Set();
let players=[];

async function interact({page,route},objective,quest,count){
  for (let tries=0;tries<4;tries++){
    await route.walk(objective.x);
    await route.changeHeight(objective.y);
    const t=(await frame(page)).t;
    await page.waitForFunction(t=>window.lab.frame.t>t+.05,t);
    if (Math.abs((await route.actor()).x-objective.x)<44) break;
  }
  await page.waitForFunction(()=>window.lab.frame.storyNearbyMilestone,undefined,{timeout:5000});
  await page.keyboard.press('KeyG');
  await route.count(quest,count);
}

async function prepareSection(player,quest,upperDeck){
  const {page,route}=player;
  const id=await route.node();
  const count=(await frame(page)).story.quests[quest.id].count;
  const step=quest.itinerary[count];
  if(step.node!==id) return;
  if(step.kind==='inspect'){
    await interact(player,step,quest.id,count+(step.airflow?0:1));
    if(step.airflow){
      const select=label=>page.waitForFunction(label=>window.lab.frame.storyAirflow?.selection===label,label);
      await select(step.airflow.choices[0].label);
      if(upperDeck){
        await page.keyboard.press('KeyG');
        await select(step.airflow.choices[1].label);
      }
      await page.locator('#airflowCommit').click();
      await route.count(quest.id,count+1);
    }
    return;
  }
  assert.equal((await frame(page)).coop.shared,false);
  if(id==='fontaine-grand-stage-approach'&&!upperDeck){
    await route.walk(678);
    await page.keyboard.down('Space');
    try{await route.walk(818)}finally{await page.keyboard.up('Space')}
  }
  const initial=(await frame(page)).kills;
  for(const [index,[x,y]] of hallwayEnemies[id].entries()){
    if((await frame(page)).kills>initial+index) continue;
    await route.walk(x-30);
    await route.changeHeight(y);
    const kill=()=>page.waitForFunction(n=>window.lab.frame.kills>=n,initial+index+1,{timeout:11000});
    await page.keyboard.down('KeyJ');
    try {
      await kill();
    } catch (error){
      if(error.name!=='TimeoutError') throw error;
      await page.keyboard.up('KeyJ');
      await page.locator('#auto').click();
      await page.waitForFunction(()=>window.lab.frame.auto);
      await kill();
    } finally {
      await page.keyboard.up('KeyJ');
      if((await frame(page)).auto){
        await page.locator('#auto').click();
        await page.waitForFunction(()=>!window.lab.frame.auto);
      }
    }
  }
  await route.count(quest.id,count+1);
}

async function leaveArena({page,route},arena){
  const right=nodes[arena].exits.at(-1);
  await route.walk(right.x);
  await route.changeHeight(right.y??480);
  await page.waitForFunction(name=>{
    const p=window.lab.frame.storyNearbyPortal;
    return p?.available&&p.name===name;
  },right.rideLabel??nodes[right.to].name,{timeout:8000});
  await page.keyboard.press('KeyF');
  await route.waitNode(right.to);
}

async function fight(page,quest,goal,side){
  await page.evaluate(({quest,goal,side})=>{
    const held=new Set();
    const start=window.lab.frame.t;
    const strikes=new Set();
    const hold=(code,down)=>{
      if (down===held.has(code)) return;
      down ? held.add(code) : held.delete(code);
      window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    };
    function tick(){
      const f=window.lab.frame,b=f.fieldBoss,a=f.actors[f.active-1];
      const won=f.story.quests[quest]?.count>=goal;
      if (won||!b||f.returns||f.t-start>45){
        for (const code of held) hold(code,false);
        window.ruinCoopResult={won,returns:f.returns,moves:[...strikes]};
        return;
      }
      if (b.move) strikes.add(b.move);
      const zones=Object.values(b.zones??{});
      const options=[b.x+side*77,b.x-side*77,b.x+side*32,b.x-side*32];
      for (const z of zones) options.push(z.left-34,z.right+34);
      const safe=options.filter(x=>zones.every(z=>x<z.left-18||x>z.right+18));
      const cost=x=>Math.abs(a.x-x)+.9*Math.abs(x-(b.x+side*77));
      safe.sort((x,y)=>cost(x)-cost(y));
      const dx=(safe[0]??b.x)-a.x,aim=b.x-a.x;
      const turn=Math.abs(dx)<10&&Math.abs(aim)>5&&a.dir*aim<0;
      hold('KeyA',dx<-9||turn&&aim<0);
      hold('KeyD',dx>9||turn&&aim>0);
      hold('KeyJ',Math.abs(aim)<106&&aim*a.dir>0);
      requestAnimationFrame(tick);
    }
    document.activeElement.blur();
    requestAnimationFrame(tick);
  },{quest,goal,side});
}

try{
  for (const [id,proof] of Object.entries(tests)){
    const spec=specs.find(spec=>spec.id===id);
    const {quest,after}=spec.storyWindow;
    const q=graph.quests.find(q=>q.id===quest), arena=spec.node;
    const path=proof.lua.path??(spec.controller==='windRing'?['tunigi-return-shelter','tunigi-elite-passage']:['bygone-listening-gallery']);
    players=[];
    for (let i=0;i<2;i++){
      const page=await browser.newPage({viewport:{width:1240,height:930}});
      const route=waypointDriver(page,nodes,{walkTimeout:23000});
      page.on('pageerror',err=>errors.add(err.message));
      page.on('response',res=>{if(res.url().endsWith('/api/frame')&&!res.ok())errors.add('Frame HTTP '+res.status())});
      players.push({page,route});
      await page.goto(process.env.LAB_URL||'http://127.0.0.1:9068/');
      await page.waitForFunction(()=>window.lab?.frame);
      await page.locator('#importSave').setInputFiles('work/coop-'+id+'-fixture.json');
      await route.waitNode(q.hub);
      await route.accept(quest);
      await route.cross(path[0]);
      await page.locator('#coopPanel summary').click();
    }
    const [host,guest]=players;
    await host.page.locator('#coopCreate').click();
    await host.page.waitForFunction(()=>window.lab.frame.coop?.code);
    const code=(await frame(host.page)).coop.code;
    await guest.page.locator('#coopCode').fill(code);
    await guest.page.locator('#coopJoin').click();
    await guest.page.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
    await Promise.all(players.map(async(player,i)=>{
      const {page,route}=player;
      for(const node of path){
        if(await route.node()!==node) await route.cross(node);
        await prepareSection(player,q,Boolean(i));
      }
      if(spec.controller==='grandFinale') assert.equal((await frame(page)).storyStageLayout,i?'deck':'cover');
    }));
    console.log(id,'approach cleared in both profiles');
    await Promise.all(players.map(async({route})=>{
      await route.cross(arena);
      await route.walk(spec.home-170);
    }));
    const initial=await Promise.all(players.map(({page})=>frame(page)));
    assert.ok(initial.every(f=>f.coop.shared&&f.fieldBoss?.maxhp===spec.hp));
    for(const move of proof.lua.moves){
      await Promise.all(players.map(({page})=>page.waitForFunction(move=>{
        const b=window.lab.frame.fieldBoss;
        return b?.move===move&&Object.values(b.zones??{}).some(z=>!z.active);
      },move,{timeout:30000})));
      const zoneGeometry=f=>Object.values(f.fieldBoss.zones??{}).map(z=>[z.left,z.right,z.top,z.first]);
      const shapes=await Promise.all(players.map(({page})=>frame(page).then(zoneGeometry)));
      assert.deepEqual(shapes[0],shapes[1]);
    }
    if(proof.lua.movingHitbox){
      await host.page.waitForFunction(()=>Object.values(window.lab.frame.fieldBoss?.zones??{}).some(z=>z.hitLeft!==undefined));
    }
    await host.page.locator('.game').screenshot({path:prefix+'-'+id+'.png'});
    await Promise.all(players.map(({page},i)=>fight(page,quest,after,i?1:-1)));
    await Promise.all(players.map(({page})=>page.waitForFunction(()=>window.ruinCoopResult,undefined,{timeout:100000})));
    await Promise.all(players.map(async(player,i)=>{
      const {page,route}=player;
      const victory=await page.evaluate(()=>window.ruinCoopResult);
      assert.ok(victory.won&&!victory.returns,JSON.stringify(victory));
      const f=await frame(page);
      assert.equal(f.coop.shared,false);
      assert.equal(f.progression.killXp,initial[i].progression.killXp);
      assert.equal(f.mora,initial[i].mora);
      assert.equal(f.progression.questXp-initial[i].progression.questXp,proof.lua.chapterFirstClearExp??0);
      if(spec.controller==='windRing'){
        await route.walk(55);
        await page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.reason.includes('崩れた壁'));
        await page.keyboard.press('KeyF');
        assert.equal(await route.node(),arena);
      }
      for(const [index,objective] of q.itinerary.entries()){
        if(index<after) continue;
        if(await route.node()!==objective.node){
          if(await route.node()===arena) await leaveArena(player,arena);
          if(await route.node()!==objective.node) await route.cross(objective.node);
        }
        await interact(player,objective,quest,index+(objective.performance?0:1));
        if(objective.performance){
          await page.waitForFunction(()=>window.lab.frame.storyTheaterPerformance?.phase==='cue');
          await page.keyboard.press('KeyG');
          await route.count(quest,index+1);
          assert.equal((await frame(page)).storyTheaterPerformance.phase,'performed');
        }
      }
      if(await route.node()===arena) await leaveArena(player,arena);
      if(await route.node()!==q.hub) await route.cross(q.hub);
      const before=await frame(page);
      await route.report(quest);
      const completed=await frame(page);
      assert.deepEqual([completed.progression.questXp-before.progression.questXp,0,
        completed.mora-before.mora,completed.inventory.upgradeOre-before.inventory.upgradeOre],proof.lua.reportReward);
      await page.locator('#saveProgress').click();
      await page.waitForFunction(([key,boss])=>JSON.parse(localStorage.getItem(key))?.endgame?.bosses?.[boss]?.clears===1,[saveKey,id]);
      await page.reload();
      await page.waitForFunction(()=>window.lab?.frame);
      await page.locator('#loadProgress').click();
      await route.waitNode(q.hub);
      await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
    }));
    await Promise.all(players.map(({page})=>page.close()));
    results[id]={sharedHP:spec.hp,sharedWarnings:proof.lua.moves,bothReportedAndSaved:true,reportReward:proof.lua.reportReward};
    console.log(id,results[id]);
  }
  assert.deepEqual([...errors],[]);
  await fs.writeFile(prefix+'-browser.json',JSON.stringify({results,errors:[]},null,2)+'\n');
}catch(err){
  for(const {page} of players) if(!page.isClosed()) console.dir(await page.evaluate(()=>{
    const f=window.lab?.frame;
    const a=f?.actors[f.active-1];
    return {node:f?.story?.node,x:a?.x,y:a?.y,hp:a?.hp,auto:f?.auto,kills:f?.kills,
      t:f?.t,field:f?.fieldBoss,portal:f?.storyNearbyPortal,result:window.ruinCoopResult};
  }),{depth:2});
  throw err;
}finally{
  await browser.close();
}
