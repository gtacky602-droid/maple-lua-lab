import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1240,height:940}});
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(predicate,arg)=>page.waitForFunction(predicate,arg,{timeout:52000});
const canvas=page.locator('#game'),arena='childe-golden-house-arena',hub='liyue-harbor';
const id='boss-29030101',quest='childe-weekly-commission',prefix='evidence/childe-weekly';
const errors=[];
page.on('pageerror',error=>errors.push(error.message));

async function walk(key,predicate,arg){
 await canvas.click();
 await page.keyboard.down(key);
 try{await wait(predicate,arg)}finally{await page.keyboard.up(key)}
}

async function freeze(form){
 await wait(form=>{
  const f=window.lab.frame,b=f.weeklyBoss;
  if(!b?.damageable||b.form!==form||f.paused)return false;
  window.lab.action('pause');
  return true;
 },form);
 await wait(()=>window.lab.frame.paused);
 return frame();
}

async function resume(){
 await canvas.click();
 await page.keyboard.press('KeyP');
 await wait(()=>!window.lab.frame.paused);
}

try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8943/');
 await wait(()=>window.lab?.frame);
 const fixture=await fs.readFile('work/childe-weekly-gear.json','utf8');
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
 await page.locator('#loadProgress').click();
 await wait(node=>window.lab.frame.story.node===node,hub);
 const row=page.locator(`[data-quest="${quest}"]`);
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='active',quest);
 await walk('KeyD',node=>window.lab.frame.storyNearbyPortal?.to===node&&window.lab.frame.storyNearbyPortal.available,arena);
 await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,arena);
 const backdrop=await page.evaluate(async()=>{
  const {backgroundReady,sceneryStatus}=await import('./scenery.js');await backgroundReady;
  return sceneryStatus(window.lab.frame);
 });
 assert.deepEqual([backdrop.file,backdrop.state],['buried-weaving-background-v1.png','ready']);
 assert.deepEqual((await frame()).weeklyBoss.phaseHp.map(phase=>phase.max),[240,300,420]);
 await wait(()=>window.lab.frame.weeklyBoss.mark==='hydro');
 await page.keyboard.press('KeyE');
 await wait(()=>window.lab.frame.active===2);
 assert.equal((await frame()).weeklyBoss.mark,'hydro');
 await walk('KeyA',()=>window.lab.frame.actors[1].x<=43);
 await wait(()=>!window.lab.frame.weeklyBoss.mark);
 await wait(()=>window.lab.frame.t>4.4);
 await page.keyboard.press('KeyE');
 await wait(()=>window.lab.frame.active===1);

 await page.evaluate(()=>{
  const held=new Set();
  const set=(code,on)=>{
   if(held.has(code)===on)return;
   if(on)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  };
  const drive=()=>{
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[0];
   if(!b||b.phase==='respawn'||f.returns){
    for(const code of [...held])set(code,false);
    return;
   }
   if(!f.paused){
    const dx=b.x-a.x;
    const forward=Math.abs(dx)>62||dx*a.dir<0;
    const jump=(b.move==='WC03'||b.move==='WC09'||b.move==='WC01'&&b.moveTick>=50&&b.moveTick<208)&&a.ground;
    if(jump)window.lab.action('jump');
    set('KeyA',forward&&dx<0);set('KeyD',forward&&dx>0);
    set('KeyJ',b.damageable&&Math.abs(dx)<120&&dx*a.dir>=0);
   }else for(const code of [...held])set(code,false);
   requestAnimationFrame(drive);
  };
  requestAnimationFrame(drive);
 });
 const second=await freeze(2);
 await page.locator('#fieldBoss').waitFor({state:'visible'});
 await wait(()=>document.getElementById('fieldBossLabel').textContent.includes('邪眼'));
 assert.equal(await page.locator('#weeklyPhases progress').count(),3);
 assert.equal(second.weeklyBoss.phaseHp[0].hp,0);
 await page.locator('.game').screenshot({path:prefix+'-electro.png'});
 await resume();

 const third=await freeze(3);
 await wait(()=>document.getElementById('fieldBossLabel').textContent.includes('魔王武装'));
 assert.deepEqual(third.weeklyBoss.phaseHp.slice(0,2).map(phase=>phase.hp),[0,0]);
 assert.ok(third.draws.some(draw=>draw.source==='childe-foul-idle-source-v1.png'));
 await canvas.screenshot({path:prefix+'-png.png'});
 await page.locator('#renderMode').selectOption('rect');
 await wait(()=>window.lab.frame.commands>1000);
 const standard=await frame();
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(n=>window.lab.frame.commands<n*.75,standard.commands);
 const light=await frame();
 assert.deepEqual([standard.t,light.t],[third.t,third.t]);
 assert.equal(light.weeklyBoss.hp,third.weeklyBoss.hp);
 await canvas.screenshot({path:prefix+'-light.png'});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.locator('#weeklyPhases').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().right<=390));
 await page.setViewportSize({width:1240,height:940});
 await page.locator('#renderMode').selectOption('sprite');
 await resume();
 await wait(()=>window.lab.frame.weeklyBoss?.phase==='respawn');
 const defeated=await frame();
 assert.equal(defeated.returns,0);
 assert.equal(defeated.endgame.bosses[id].clears,1);
 assert.equal(defeated.story.quests[quest].count,1);
 await page.getByRole('button',{name:'拠点へ：璃月・港の広場',exact:true}).click();
 await wait(node=>window.lab.frame.story.node===node,hub);
 await row.getByRole('button',{name:'報告',exact:true}).click();
 await wait(quest=>window.lab.frame.story.quests[quest]?.status==='complete',quest);
 await page.locator('#saveProgress').click();
 await wait(()=>document.getElementById('saveStatus').textContent.includes('冒険を保存しました'));
 await page.reload();
 await wait(()=>window.lab?.frame);
 await page.locator('#loadProgress').click();
 await wait(quest=>window.lab.frame.story?.quests[quest]?.status==='complete',quest);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
 assert.equal(saved.weeklyBosses[id].hp,0);
 assert.deepEqual(errors,[]);
 await fs.writeFile(prefix+'-browser.json',JSON.stringify({entry:true,threeForms:true,markLeftAfterSwapAndCleanse:true,
  actualBattleAndReport:true,endedHp:defeated.actors[0].hp,storedBestAndRespawn:true,viewport390:true,
  sameStateCommands:{png:third.commands,standard:standard.commands,light:light.commands},backdrop,errors},null,2)+'\n');
 console.log('Childe Chrome: entrance, mark and boundary, three forms, same-frame sprite comparison, report and reload passed');
}catch(error){
 const f=await frame();
 console.error({node:f?.story?.node,t:f?.t,boss:f?.weeklyBoss,turn:f?.active,actors:f?.actors?.map(a=>[a.x,a.hp]),errors});
 await page.screenshot({path:'work/childe-weekly-failure.png'});
 throw error;
}finally{
 await browser.close();
}
