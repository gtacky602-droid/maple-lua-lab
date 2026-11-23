import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const graph=await read('content/story-graph.json');
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const tests=await read('evidence/coop-ruin-guardians-lua-http.json');
const specs=(await read('content/field-boss-spawns.json')).fieldBosses;
const prefix='evidence/coop-ruin-guardians',saveKey='maple-lua-lab.checkpoint.v1';
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
    const {quest,first,after}=spec.storyWindow;
    const q=graph.quests.find(q=>q.id===quest), arena=spec.node;
    const approach=first?'tunigi-return-shelter':'bygone-listening-gallery';
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
      await route.cross(approach);
      await page.locator('#coopPanel summary').click();
    }
    const [host,guest]=players;
    await host.page.locator('#coopCreate').click();
    await host.page.waitForFunction(()=>window.lab.frame.coop?.code);
    const code=(await frame(host.page)).coop.code;
    await guest.page.locator('#coopCode').fill(code);
    await guest.page.locator('#coopJoin').click();
    await guest.page.waitForFunction(code=>window.lab.frame.coop?.code===code,code);
    await Promise.all(players.map(async({page,route})=>{
      if (first){
        await route.cross('tunigi-elite-passage');
        assert.equal((await frame(page)).coop.shared,false);
        const original=(await frame(page)).kills;
        for(const [index,[x,y]] of [[392,480],[908,390]].entries()){
          if((await frame(page)).kills>original+index) continue;
          await route.walk(x);
          await route.changeHeight(y);
          await page.locator('#auto').click();
          await page.waitForFunction(n=>window.lab.frame.kills>=n,original+index+1,{timeout:35000});
          await page.locator('#auto').click();
          await page.waitForFunction(()=>!window.lab.frame.auto);
        }
        await route.count(quest,first);
      }
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
      if(first){
        await route.walk(55);
        await page.waitForFunction(()=>window.lab.frame.storyNearbyPortal?.reason.includes('崩れた壁'));
        await page.keyboard.press('KeyF');
        assert.equal(await route.node(),arena);
      }
      const [record,report]=q.itinerary.slice(-2);
      await interact(player,record,quest,after+1);
      const right=nodes[arena].exits.at(-1);
      await route.walk(right.x);
      await page.waitForFunction(name=>{
        const p=window.lab.frame.storyNearbyPortal;
        return p?.available&&p.name===name;
      },right.rideLabel,{timeout:8000});
      await page.keyboard.press('KeyF');
      await route.waitNode(approach);
      await route.cross(q.hub);
      await interact(player,report,quest,q.goal);
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
    return {node:f?.story?.node,x:a?.x,y:a?.y,field:f?.fieldBoss,portal:f?.storyNearbyPortal,result:window.ruinCoopResult};
  }),{depth:2});
  throw err;
}finally{
  await browser.close();
}
