import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/primo-harbor-fixture.json','utf8'));await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='liyue-harbor');
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('エンシェントヴィシャップ');await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss?.name==='エンシェントヴィシャップ（試作素材）');
 await page.route('**/api/frame',route=>route.request().headers()['x-playtest']?route.continue():route.abort());
 const result=await page.evaluate(async()=>{
  const session=window.lab.frame.session;let f=window.lab.frame;
  for(let i=0;i<1500;i++){
   const b=f.boss,a=f.actors[f.active-1];if(!b)throw Error('encounter ended');
   if(b.phase==='spin_warning'&&b.rearResponse){
    await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json','X-Playtest':'1'},body:JSON.stringify({session,steps:0,actions:['pause']})});return {boss:b,actor:a,requests:i};
   }
   const desired=b.phase==='awake'?380:b.x-(b.facing||-1)*100,actions=[];
   if(f.active!==2)actions.push('swap');
   if(b.phase==='shower_warning'&&b.timer<.8&&a.lock<=0)actions.push('skill4');
   const jump=['claw_warning','spin_warning','slam_warning'].includes(b.phase)&&b.timer<.4;if(jump&&a.ground)actions.push('jump');
   const r=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json','X-Playtest':'1'},body:JSON.stringify({session,steps:6,actions,input:{left:a.x>desired+6,right:a.x<desired-6,jump}})});
   if(!r.ok)throw Error('frame '+r.status);f=await r.json();
  }throw Error('rear reaction not reached');
 });
 await page.unroute('**/api/frame');
 await page.waitForFunction(()=>window.lab.frame.paused&&window.lab.frame.boss?.phase==='spin_warning');await page.locator('canvas').first().screenshot({path:'evidence/primo-rear-browser.png'});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/primo-rear-browser.json',JSON.stringify({errors,result,method:'Lv20 Beidou fixture; automatic UI polling suspended during accelerated input test, UI boss launch, normal frame API actions/movement, accelerated; no direct state mutation'},null,2));console.log('Rear spin triggered by normal movement input');
}finally{await browser.close()}
