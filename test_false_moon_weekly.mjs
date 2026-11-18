import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const wait=(fn,arg,timeout=65000)=>page.waitForFunction(fn,arg,{timeout});
const frame=()=>page.evaluate(()=>window.lab.frame);
const canvas=page.locator('#game'),prefix='evidence/false-moon-weekly';
const hub='nod-town',outer='nod-false-moon-court',inner='nod-false-moon-rift';
const quest='false-moon-weekly-commission',id='boss-29130201';
const errors=[];
page.on('pageerror',e=>errors.push(e.message));

async function capture(name){
 const bytes=await canvas.evaluate(el=>el.toDataURL('image/png').split(',')[1]);
 await fs.writeFile(prefix+'-'+name+'.png',Buffer.from(bytes,'base64'));
 return bytes;
}
async function scene(){
 return page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');
  await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
}
const mode=m=>page.evaluate(m=>{window.moonMode=m},m);

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8953/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/false-moon-weekly-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(hub=>window.lab.frame.story?.node===hub,hub);
 const row=page.locator('[data-quest="'+quest+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 await canvas.click();
 const toward=(await frame()).actors[0].x<210?'KeyD':'KeyA';
 await page.keyboard.down(toward);
 try{await wait(n=>window.lab.frame.storyNearbyPortal?.to===n&&window.lab.frame.storyNearbyPortal.available,outer,15000);}
 finally{await page.keyboard.up(toward);}
 await page.keyboard.press('KeyF');
 await wait(n=>window.lab.frame.story.node===n,outer);
 const court=await scene();
 assert.deepEqual([court.key,court.state],['falseMoonCourt','ready']);
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.rule?.state==='rule');
 const unbroken=await frame();
 assert.equal(unbroken.weeklyBoss.falseMoon.rule.kind,'still');
 assert.equal(unbroken.weeklyBoss.falseMoon.rule.violated,false);
 await page.locator('.game').screenshot({path:prefix+'-rule.png'});
 await page.keyboard.down('KeyD');
 try{await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.rule?.violated);}
 finally{await page.keyboard.up('KeyD');}
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.tick>=456);
 await canvas.click();
 await page.keyboard.press('ShiftLeft');
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.card==='WM08');

 await page.evaluate(()=>{
  const keys=new Set();
  let faced=false;
  window.moonMode='cover';
  window.moonStages=[];
  function key(code,on){
   if(keys.has(code)===on)return;
   if(on)keys.add(code);else keys.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,b=f.weeklyBoss,v=b?.falseMoon;
   let left=false,right=false,attack=false;
   if(v&&!f.paused&&b.phase!=='respawn'){
    if(window.moonStages.at(-1)!==v.stage)window.moonStages.push(v.stage);
    const a=f.actors[f.active-1],mode=window.moonMode;
    let goal=a.x,target;
    if(mode==='cover')goal=160;
    else if(mode==='portal')goal=480;
    else if(mode==='shadows'){
     const shadows=Array.isArray(v.shadows)?v.shadows.filter(e=>e.hp>0):[];
     target=shadows[0]?.x;
    }else if(mode==='away'&&v.rule?.kind==='away'&&v.tick<115){
     if(!faced){
      const want=v.rule.away==='left'?-1:1;
      if(a.dir===want&&v.tick>4)faced=true;
      else goal=a.x+want*35;
     }
    }else if(mode==='finish'&&b.damageable)target=b.x;
    if(target!==undefined){
     const dx=target-a.x;
     goal=target-74;
     if(Math.abs(goal-a.x)<10&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*23;
     attack=Math.abs(dx)<115&&Math.sign(dx)===a.dir;
    }
    left=goal<a.x-10;right=goal>a.x+10;
   }
   key('KeyA',left);key('KeyD',right);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 });
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.cover);
 await page.locator('.game').screenshot({path:prefix+'-ward.png'});
 await wait(()=>window.lab.frame.events.some(e=>e.kind==='false-moon:WM08:ward'&&e.actor===1));
 const shielded=await frame();
 assert.equal(shielded.events.filter(e=>e.kind==='false-moon:WM09:violation:walk').length,1);
 assert.equal(shielded.events.filter(e=>e.kind==='false-moon:WM12').length,1);
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.card==='WM13');
 await mode('portal');
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.canUse);
 await canvas.click();
 await page.keyboard.press('KeyH');
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.confirm>0);
 await page.locator('#weeklyFalseMoonCancel').click();
 await wait(()=>window.lab.frame.events.some(e=>e.kind==='false-moon:WM13:cancel'));
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.canUse);
 await page.locator('#weeklyFalseMoonUse').click();
 await wait(n=>window.lab.frame.story.node===n,inner);
 const other=await scene();
 assert.deepEqual([other.key,other.state],['falseMoonRift','ready']);
 await mode('wait');
 await wait(()=>window.lab.frame.weeklyBoss?.falseMoon.card==='WM15');
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>window.lab.frame.paused);
 const shadow=await frame();
 assert.equal(shadow.weeklyBoss.falseMoon.shadows.length,3);
 const png=await capture('png');
 await page.locator('#renderMode').selectOption('rect');
 await wait(()=>window.lab.frame.commands>10000);
 const standard=await frame(),normal=await capture('standard');
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.7,standard.commands);
 const reduced=await frame(),light=await capture('light');
 assert.deepEqual([standard.t,reduced.t],[shadow.t,shadow.t]);
 assert.deepEqual(reduced.weeklyBoss,shadow.weeklyBoss);
 assert.equal(new Set([png,normal,light]).size,3);
 await page.locator('#renderMode').selectOption('sprite');
 await wait(()=>window.lab.frame.commands<500);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyFalseMoon').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await canvas.click();
 await mode('shadows');
 await page.keyboard.press('KeyP');
 await wait(n=>window.lab.frame.story.node===n&&window.lab.frame.weeklyBoss?.falseMoon.exposure>0,outer);
 const returned=await frame();
 assert.equal(returned.weeklyBoss.falseMoon.epoch,2);
 assert.equal(returned.events.filter(e=>e.kind==='false-moon:WM15:shadow').length,3);
 assert.deepEqual(returned.events.filter(e=>e.kind==='false-moon:WM16:loss').map(e=>e.value),[408]);
 assert.equal(returned.weeklyBoss.falseMoon.limit,408);
 await page.locator('.game').screenshot({path:prefix+'-return.png'});
 await mode('away');
 await wait(()=>window.lab.frame.events.some(e=>e.kind==='false-moon:WM10:success'));
 assert.equal((await frame()).events.filter(e=>e.kind==='false-moon:WM10:violation:facing').length,0);
 await mode('finish');
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const done=await frame();
 assert.equal(done.endgame.bosses[id].clears,1);
 assert.equal(done.story.quests[quest].count,1);
 assert.equal(done.returns,0);
 const stages=await page.evaluate(()=>window.moonStages);
 assert.deepEqual(stages,['outer','entering','inner','returning','outer']);
 await page.getByRole('button',{name:'拠点へ：ナド・クライ・町の広場',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.weeklyBosses[id].hp,0);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({court,other,stages,walkViolationExactlyOnce:true,coveredShock:true,
  cancelAndConfirm:true,realShadows:3,settlement:408,lookAwaySuccess:true,clearReportRestore:true,viewport390:true,
  commands:{png:shadow.commands,standard:standard.commands,light:reduced.commands},errors},null,2)+'\n');
 console.log('False Moon Chrome: decree, ward, cancel and enter, three shadows, return, clear, report and save passed');
}catch(error){
 const f=await page.evaluate(()=>window.lab?.frame);
 console.error(JSON.stringify({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.y,a.hp,a.dir]),
  quest:f?.story?.quests?.[quest],nearbyPortal:f?.storyNearbyPortal,
  stages:await page.evaluate(()=>window.moonStages),events:Array.isArray(f?.events)?f.events.filter(e=>e.kind.startsWith('false-moon:')).slice(-24):[],
  status:await page.locator('#status').textContent(),errors},null,2));
 await page.screenshot({path:'work/false-moon-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
