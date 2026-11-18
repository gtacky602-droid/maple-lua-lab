import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1160,height:940}});
const canvas=page.locator('#game');
const id='original-twin-shuttle-loom', quest='loom-stopped', arena='buried-weaving-room';
const prefix='evidence/twin-shuttle-loom';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);

async function gate(x,node){
  const f=await frame();
  const east=f.actors[f.active-1].x<x;
  const key=east?'KeyD':'KeyA';
  await canvas.click();
  await page.keyboard.down(key);
  try{
    await page.waitForFunction(({x,east})=>{
      const f=window.lab.frame,a=f.actors[f.active-1];
      return east?a.x>=x-6:a.x<=x+6;
    },{x,east});
  }finally{
    await page.keyboard.up(key);
  }
  await page.waitForFunction(node=>{
    const p=window.lab.frame.storyNearbyPortal;
    return p?.to===node&&p.available;
  },node);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}
try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8852/');
  await page.waitForFunction(()=>window.lab?.frame);
  const fixture=await fs.readFile('work/twin-shuttle-loom-fixture.json','utf8');
  await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(()=>window.lab.frame.story.node==='liyue-harbor');
  const row=page.locator('[data-quest="'+quest+'"]');
  await row.getByRole('button',{name:'受注',exact:true}).click();
  await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
  await gate(1240,arena);
  const before=await frame();
  const scenery=await page.evaluate(async()=>{
    const module=await import('./scenery.js');
    await module.backgroundReady;
    return module.sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(scenery,{key:'buriedWeaving',file:'buried-weaving-background-v1.png',state:'ready'});
  assert.ok(before.weeklyBoss.shuttles.every(part=>!part.broken));
  await canvas.screenshot({path:prefix+'-closed.png'});

  await page.evaluate(()=>{
    const held=new Set(), moves=new Set(),start=window.lab.frame.t;
    let frozen=false,rebuild=false,firstOpenHP;
    function hold(code,on){
      if(on===held.has(code))return;
      if(on)held.add(code);else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    }
    function drive(){
      const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1];
      if(b?.phase==='respawn'||f.returns>0||f.t-start>130){
        for(const code of [...held])hold(code,false);
        window.loomResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),hp:a.hp,
          returns:f.returns,exposures:b?.cycle,moves:[...moves],rebuild,firstOpenHP};
        return;
      }
      if(!b||f.paused){requestAnimationFrame(drive);return}
      if(b.move)moves.add(b.move);
      if(b.cycle===1&&b.stage==='sealed')rebuild=true;
      if(b.stage==='open'&&!frozen){
        frozen=true;firstOpenHP=b.hp;
        window.lab.action('pause');
      }
      const target=b.stage==='open'?480:b.shuttles.find(part=>!part.broken)?.x??480;
      let dest=target-57,jump=!a.ground;
      for(const area of (Array.isArray(b.zones)?b.zones:[])){
        if(b.tick<area.at-48||a.y<=area.top||a.y-50>=area.bottom)continue;
        if(area.top>=422&&area.right-area.left>=170){
          if(b.tick>=area.at-15&&b.tick<area.at&&a.ground&&area.left-12<a.x&&a.x<area.right+12){
            window.lab.action('jump');jump=true;
          }
        }else if(area.left-16<dest&&dest<area.right+16){
          dest=[area.left-24,area.right+24].sort((x,y)=>Math.abs(x-a.x)-Math.abs(y-a.x))[0];
        }
      }
      const dx=dest-a.x,aim=target-a.x,turn=Math.abs(aim)>5&&aim*a.dir<0;
      hold('KeyA',dx<-8||Math.abs(dx)<=8&&turn&&aim<0);
      hold('KeyD',dx>8||Math.abs(dx)<=8&&turn&&aim>0);
      hold('Space',jump);
      hold('KeyJ',Math.abs(aim)<110&&!turn);
      requestAnimationFrame(drive);
    }
    requestAnimationFrame(drive);
  });
  await page.waitForFunction(()=>window.lab.frame.paused&&window.lab.frame.weeklyBoss?.stage==='open');
  const png=await frame();
  assert.ok(png.draws.some(draw=>draw.source==='twin-shuttle-loom-source-v1.png'));
  assert.ok(png.weeklyBoss.shuttles.every(part=>part.broken)&&png.weeklyBoss.openTicks>0);
  await canvas.screenshot({path:prefix+'-png.png'});
  await page.locator('#renderMode').selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>3000);
  const standard=await frame();
  await page.locator('#renderMode').selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.equal(light.t,png.t);
  assert.equal(standard.t,png.t);
  await canvas.screenshot({path:prefix+'-light.png'});
  await page.locator('#renderMode').selectOption('sprite');
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.loomResult,undefined,{timeout:150000});
  const play=await page.evaluate(()=>window.loomResult);
  assert.ok(play.won&&play.returns===0&&play.exposures>=1,JSON.stringify(play));
  const after=await frame();
  assert.equal(after.mora-before.mora,360);
  assert.equal(after.kills-before.kills,1);
  await gate(45,'liyue-harbor');
  const preReport=await frame();
  await row.getByRole('button',{name:'報告',exact:true}).click();
  await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
  const report=await frame();
  assert.deepEqual([report.progression.questXp-preReport.progression.questXp,report.mora-preReport.mora],[2100,450]);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
  assert.equal(save.weeklyBosses[id].hp,0);
  assert.deepEqual(errors,[]);
  await fs.writeFile(prefix+'-browser.json',JSON.stringify({play,scenery,questReport:{xp:2100,mora:450},
    savedDefeat:true,commands:{png:png.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
  console.log(play);
}catch(error){
  console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,boss:window.lab?.frame.weeklyBoss,
    result:window.loomResult,nearby:window.lab?.frame.storyNearbyPortal})),errors);
  throw error;
}finally{
  await browser.close();
}
