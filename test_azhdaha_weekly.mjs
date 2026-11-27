import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(predicate,arg,timeout=85000)=>page.waitForFunction(predicate,arg,{timeout});
const canvas=page.locator('#game'),prefix=process.env.AZHDAHA_PROOF_PREFIX||'evidence/azhdaha-weekly';
const node='azhdaha-dragon-seal-arena',hub='liyue-harbor',quest='azhdaha-weekly-commission',id='boss-29040101';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function freeze(kind){
 await wait(kind=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  if(!b||f.paused)return false;
  const ready=kind==='infusion'?b.move==='WZ09'&&b.form===1&&b.moveTick>=65:
   b.tail&&b.safeLane===1&&b.moveTick>=140;
  if(!ready)return false;
  window.lab.action('pause');
  return true;
 },kind,kind==='tail'?110000:85000);
 await wait(()=>window.lab.frame.paused);
 return frame();
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>!window.lab.frame.paused);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8944/');
 await wait(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),
  await fs.readFile('work/azhdaha-weekly-visual-gear.json','utf8'));
 await page.locator('#loadProgress').click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 if(!(await frame()).holdAllyFire){
  await page.locator('#allyFire').click();
  await wait(()=>window.lab.frame.holdAllyFire);
 }
 const row=page.locator(`[data-quest="${quest}"]`);
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
 const selector=page.locator('#azhdahaElements');
 assert.equal(await selector.getByRole('button').count(),4);
 await selector.getByRole('button',{name:'水＋雷',exact:true}).click();
 await wait(()=>window.lab.frame.azhdahaLobby?.selected?.join(':')==='hydro:electro');
 await wait(()=>document.querySelector('#azhdahaElements button[aria-pressed="true"]')?.textContent==='水＋雷');
 assert.equal(await selector.getByRole('button',{name:'水＋雷',exact:true}).getAttribute('aria-pressed'),'true');
 await canvas.click();
 await page.keyboard.down('KeyD');
 try{await wait(node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,node)}
 finally{await page.keyboard.up('KeyD')}
 await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,node);
 assert.deepEqual((await frame()).weeklyBoss.elementSlots,['hydro','electro']);
 const scene=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([scene.key,scene.state],['liyueSealedCavern','ready']);
 await page.evaluate(()=>{
  const held=new Set();
  const set=(code,on)=>{
   if(held.has(code)===on)return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  };
  const run=()=>{
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[0];
   if(!b||b.phase==='respawn'||f.returns){
    for(const code of [...held])set(code,false);
    return;
   }
   if(!f.paused){
    const dx=b.x-a.x;
    const threshold=b.maxhp*(3-b.form)/3;
    let goal=b.x+(dx<0?76:-76);
    const attacks=b.damageable&&(window.azhdahaFinish||b.form<3&&b.hp>threshold);
    if(b.move==='WZ09'&&!b.damageable){
     const sides=[b.x-320,b.x+320].filter(x=>x>=28&&x<=1028).sort((left,right)=>Math.abs(left-a.x)-Math.abs(right-a.x));
     goal=sides[0];
    }else if(b.form===3&&!window.azhdahaFinish){
     goal=b.safeLane?(b.safeLane-.5)*352:a.x<528?106:950;
    }
    const delta=goal-a.x;
    const turn=attacks&&Math.abs(delta)<=9&&dx*a.dir<0;
    const move=Math.abs(delta)>9?(delta>0?1:-1):turn?(dx>0?1:-1):0;
    const jump=b.move==='WZ02'||b.move==='WZ11'&&b.form===3;
    if(jump&&a.ground)window.lab.action('jump');
    set('KeyA',move<0);set('KeyD',move>0);set('Space',jump);
    set('KeyJ',!!attacks&&Math.abs(dx)<118&&dx*a.dir>=0);
   }else for(const code of [...held])set(code,false);
   requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
 });
 const infused=await freeze('infusion');
 assert.equal(infused.weeklyBoss.damageable,false);
 await wait(()=>document.getElementById('fieldBossLabel').textContent.includes('地脈を吸収・水'));
 await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await page.locator('#packRectArt').uncheck();
 await wait(()=>window.lab.frame.commands>1000);
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(count=>window.lab.frame.commands<count*.7,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t],[infused.t,infused.t]);
 assert.equal(light.weeklyBoss.hp,infused.weeklyBoss.hp);
 await canvas.screenshot({path:prefix+'-light.png'});
 await page.locator('#renderMode').selectOption('sprite');
 await resume();
 const tail=await freeze('tail');
 assert.ok(tail.weeklyBoss.tail&&tail.weeklyBoss.damageable&&tail.weeklyBoss.form===3);
 assert.equal(tail.draws.some(draw=>draw.source==='azhdaha-idle-source-v1.png'),false);
 await wait(()=>document.getElementById('fieldBossLabel').textContent.includes('樹尾の戦場'));
 await page.locator('.game').screenshot({path:prefix+'-tail.png'});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#fieldBoss').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await page.evaluate(()=>{window.azhdahaFinish=true});
 await resume();
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const defeated=await frame();
 assert.equal(defeated.returns,0);
 assert.equal(defeated.endgame.bosses[id].clears,1);
 assert.equal(defeated.story.quests[quest].count,1);
 await page.getByRole('button',{name:'拠点へ：璃月・港の広場',exact:true}).click();
 await wait(hub=>window.lab.frame.story.node===hub,hub);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(q=>window.lab.frame.story.quests[q]?.status==='complete',quest);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(q=>window.lab.frame.story?.quests[q]?.status==='complete',quest);
 const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(save.weeklyBosses[id].hp,0);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({entry:true,chosenPair:['hydro','electro'],
  bothAbsorptionsAndTargetableTail:true,normalKeyBattleAndReport:true,savedRespawn:true,
  remainingHp:defeated.actors[0].hp,viewport390:true,scene,
  sameStateCommands:{png:infused.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
 console.log('Azhdaha Chrome: selected pair, portal, two absorptions, tail, combat, report and save passed');
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,actors:f?.actors?.map(a=>[a.x,a.hp]),returns:f?.returns,errors});
 await page.screenshot({path:'work/azhdaha-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
