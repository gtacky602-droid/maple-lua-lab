import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/geo-rain-harbor-fixture.json','utf8'));await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='liyue-harbor');
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('純水精霊');await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss?.name==='純水精霊（試作素材）');
 const result=await page.evaluate(async()=>{
  const session=window.lab.frame.session;let f=window.lab.frame;
  for(let i=0;i<600;i++){
   const b=f.boss,a=f.actors[0];if(!b)throw Error('encounter ended');
   if(b.phase==='mimics'){
    await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,steps:0,actions:['pause']})});return {boss:b,actor:a,requests:i};
   }
   const desired=900;
   const r=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,steps:6,actions:['dodge'],input:{left:a.x>desired+5,right:a.x<desired-5}})});
   if(!r.ok)throw Error('frame '+r.status);f=await r.json();
  }throw Error('seal not reached');
 });
 await page.waitForFunction(()=>window.lab.frame.paused&&window.lab.frame.boss?.phase==='mimics');await page.locator('canvas').first().screenshot({path:'evidence/oceanid-browser.png'});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/oceanid-browser.json',JSON.stringify({errors,result,method:'Lv20 Columbina fixture, UI boss launch, normal frame API actions/movement, accelerated; no direct state mutation'},null,2));console.log('Oceanid catalog launch and mimic rendering checked');
}finally{await browser.close()}
