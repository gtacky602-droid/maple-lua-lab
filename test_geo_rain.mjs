import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/geo-rain-harbor-fixture.json','utf8'));await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='liyue-harbor');
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('無相の岩');await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss?.name==='無相の岩（試作素材）');
 const result=await page.evaluate(async()=>{
  const session=window.lab.frame.session;let f=window.lab.frame;
  for(let i=0;i<600;i++){
   const b=f.boss,a=f.actors[0];if(!b)throw Error('encounter ended');
   if(b.phase==='rain_warning'){
    await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,steps:0,actions:['pause']})});return {boss:b,actor:a,requests:i};
   }
   const pillars=f.draws.filter(d=>d.kind==='boss_sprite'&&d.source==='geo-pillar-source-v1.png').map(d=>d.x);pillars.sort((x,y)=>Math.abs(x-a.x)-Math.abs(y-a.x));
   const target=pillars[0],desired=target?target-65:900;
   const actions=target&&Math.abs(a.x-target)<130&&a.dir>0?['slot1','slot2']:['dodge'];
   const r=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,steps:6,actions,input:{left:a.x>desired+5,right:a.x<desired-5||(Math.abs(a.x-desired)<=5&&a.dir<0),attack:!!target}})});
   if(!r.ok)throw Error('frame '+r.status);f=await r.json();
  }throw Error('rain not reached');
 });
 await page.waitForFunction(()=>window.lab.frame.paused&&window.lab.frame.boss?.phase==='rain_warning');await page.locator('canvas').first().screenshot({path:'evidence/geo-rain-browser.png'});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/geo-rain-browser.json',JSON.stringify({errors,result,method:'Lv20 Columbina fixture, UI boss launch, normal frame API actions/movement, accelerated; no direct state mutation'},null,2));console.log('Normal pillars destroyed through actions and rain telegraph rendered');
}finally{await browser.close()}
