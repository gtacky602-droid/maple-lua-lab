import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('無相の雷');
 await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss);
 const advance=await page.evaluate(async()=>{
  const session=window.lab.frame.session;let f=window.lab.frame;
  for(let i=0;i<900;i++){
   if(f.boss?.phase==='cage'){
    await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,steps:0,actions:['pause']})});return {stepsRequested:i*6,phase:f.boss.phase,hp:f.actors[0].hp};
   }
   const response=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,steps:6,actions:['jump','dodge'],input:{right:true,jump:true}})});
   if(!response.ok)throw Error('frame '+response.status);f=await response.json();
  }
  throw Error(JSON.stringify({phase:f.boss?.phase,hp:f.actors,location:f.location}));
 });
 await page.waitForFunction(()=>window.lab.frame.paused&&window.lab.frame.boss?.phase==='cage');
 await page.locator('canvas').first().screenshot({path:'evidence/electro-cage-browser.png'});
 const boss=await page.evaluate(()=>window.lab.frame.boss);
 if(boss.name!=='無相の雷（試作素材）'||errors.length)throw Error(JSON.stringify({boss,errors}));
 await fs.writeFile('evidence/electro-cage-browser.json',JSON.stringify({errors,boss,advance,launchedFromCatalog:true,method:"UI launch then normal frame API actions jump/dodge/movement; accelerated simulation; no state mutations"},null,2));console.log('Electro cage rendered');
}finally{await browser.close()}
