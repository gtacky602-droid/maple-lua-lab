import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1160,height:940}});
const canvas = page.locator('#game');
const id = 'original-tide-surveyor';
const quest = 'surveyor-inspection';
const path = 'evidence/tide-surveyor';
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const frame = () => page.evaluate(() => window.lab.frame);
async function gate(x,node) {
  const f = await frame();
  const east = f.actors[f.active-1].x < x;
  const key = east ? 'KeyD' : 'KeyA';
  await canvas.click();
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({x,east}) => {
      const f=window.lab.frame, a=f.actors[f.active-1];
      return east ? a.x>=x-6 : a.x<=x+6;
    },{x,east});
  } finally {
    await page.keyboard.up(key);
  }
  await page.waitForFunction(node => {
    const p=window.lab.frame.storyNearbyPortal;
    return p?.to===node && p.available;
  },node);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(node => window.lab.frame.story.node===node,node);
}

try {
  await page.goto(process.env.LAB_URL || 'http://127.0.0.1:8851/');
  await page.waitForFunction(() => window.lab?.frame);
  const fixture=await fs.readFile('work/tide-surveyor-fixture.json','utf8');
  await page.evaluate(raw => localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
  await page.locator('#loadProgress').click();
  await page.waitForFunction(() => window.lab.frame.story.node==='liyue-harbor');
  const row=page.locator('[data-quest="'+quest+'"]');
  await row.getByRole('button',{name:'受注',exact:true}).click();
  await page.waitForFunction(q=>window.lab.frame.story.quests[q]?.status==='active',quest);
  await gate(1120,'tide-calibration-hall');
  const before=await frame();
  const scenery=await page.evaluate(async () => {
    const mod=await import('./scenery.js');
    await mod.backgroundReady;
    return mod.sceneryStatus(window.lab.frame);
  });
  assert.deepEqual(scenery,{key:'tideCalibration',file:'tide-calibration-background-v1.png',state:'ready'});
  await page.evaluate(() => {
    const held = new Set(), stages = new Set(), moves=new Set();
    let frozen=false;
    const start=window.lab.frame.t;
    function hold(code,on) {
      if (on===held.has(code)) return;
      if(on) held.add(code); else held.delete(code);
      window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
    }
    function control() {
      const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1];
      if(b?.phase==='respawn'||f.returns>0||f.t-start>140){
        for(const code of [...held])hold(code,false);
        window.surveyorResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),
          hp:a.hp,returns:f.returns,stages:[...stages],moves:[...moves]};
        return;
      }
      if(f.paused||!b){requestAnimationFrame(control);return}
      stages.add(b.stage);
      if(b.move)moves.add(b.move);
      if(b.move==='TS07'&&b.tick>=45&&b.tick<62&&!frozen){
        frozen=true;
        window.lab.action('pause');
      }
      let dest=410,jump=!a.ground;
      if(b.marks?.[String(a.id)])dest=a.x<480?160:800;
      for(const area of (Array.isArray(b.zones)?b.zones:[])){
        if(area.top>=440&&area.right-area.left>600){
          const when=b.move==='TS07'?(b.tick<100?53:213):51;
          if(a.ground&&b.tick>=when&&b.tick<when+3)window.lab.action('jump');
          if(b.tick>=when)jump=true;
        }else if(a.y>area.top&&area.left-20<dest&&dest<area.right+20){
          dest=[area.left-28,area.right+28].filter(x=>x>20&&x<940)
            .sort((x,y)=>Math.abs(x-a.x)-Math.abs(y-a.x))[0];
        }
      }
      const dx=dest-a.x,aim=480-a.x,turn=Math.abs(aim)>5&&aim*a.dir<0;
      hold('KeyA',dx<-8||Math.abs(dx)<=8&&turn&&aim<0);
      hold('KeyD',dx>8||Math.abs(dx)<=8&&turn&&aim>0);
      hold('Space',jump);
      hold('KeyJ',Math.abs(aim)<112&&!turn);
      requestAnimationFrame(control);
    }
    requestAnimationFrame(control);
  });
  await page.waitForFunction(() => window.lab.frame.paused && window.lab.frame.weeklyBoss?.move==='TS07',undefined,{timeout:120000});
  const png=await frame();
  assert.ok(png.draws.some(d=>d.source==='tide-surveyor-source-v1.png'));
  assert.ok(!png.draws.some(d=>d.text?.startsWith?.('結節点')));
  await canvas.screenshot({path:path+'-png.png'});
  await page.locator('#renderMode').selectOption('rect');
  await page.waitForFunction(()=>window.lab.frame.commands>3000);
  const standard=await frame();
  await page.locator('#renderMode').selectOption('h32c16');
  await page.waitForFunction(n=>window.lab.frame.commands<n*.65,standard.commands);
  const light=await frame();
  assert.equal(png.t,standard.t);
  assert.equal(png.t,light.t);
  await canvas.screenshot({path:path+'-light.png'});
  await page.locator('#renderMode').selectOption('sprite');
  await canvas.click();
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.surveyorResult,undefined,{timeout:150000});
  const play=await page.evaluate(()=>window.surveyorResult);
  assert.ok(play.won&&play.returns===0&&play.stages.join(',')==='1,2,3',JSON.stringify(play));
  const defeated=await frame();
  assert.equal(defeated.mora-before.mora,340);
  await gate(42,'liyue-harbor');
  const preReport=await frame();
  await row.getByRole('button',{name:'報告',exact:true}).click();
  await page.waitForFunction(q=>window.lab.frame.story.quests[q].status==='complete',quest);
  const report=await frame();
  assert.deepEqual([report.progression.questXp-preReport.progression.questXp,report.mora-preReport.mora],[1800,420]);
  await page.locator('#saveProgress').click();
  await page.waitForFunction(()=>document.querySelector('#saveStatus').textContent.includes('保存しました'));
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('maple-lua-lab.checkpoint.v1')));
  assert.equal(save.weeklyBosses[id].hp,0);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path+'-browser.json',JSON.stringify({play,scenery,questReport:{xp:1800,mora:420},
    savedDefeat:true,commands:{png:png.commands,standard:standard.commands,light:light.commands},errors},null,2)+'\n');
  console.log(play);
} catch (error) {
  console.error(await page.evaluate(()=>({node:window.lab?.frame.story.node,boss:window.lab?.frame.weeklyBoss,
    result:window.surveyorResult,nearby:window.lab?.frame.storyNearbyPortal})),errors);
  throw error;
} finally {
  await browser.close();
}
