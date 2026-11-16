import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('エンシェントヴィシャップ');
 for(const element of ['hydro','cryo','electro','pyro']){
  await panel.locator('[data-encounter="boss-26050101"] select').selectOption('boss_primo_'+element);
  await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(e=>window.lab.frame.boss?.element===e,element);
 }
 await page.route('**/api/frame',route=>route.request().headers()['x-playtest']?route.continue():route.abort());
 const result=await page.evaluate(async()=>{
  let f=window.lab.frame;const session=f.session;
  for(let i=0;i<500;i++){
   const b=f.boss;if(!b)throw Error('fight ended');
   const done=Array.isArray(b.fields)&&b.fields.length>0;
   const r=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json','X-Playtest':'1'},body:JSON.stringify({session,steps:done?0:6,actions:done?['pause']:[],input:{}})});if(!r.ok)throw Error(r.status);f=await r.json();
   if(done)return {element:b.element,fields:b.fields,requests:i};
  }throw Error('field not reached');
 });
 await page.unroute('**/api/frame');await page.waitForFunction(()=>window.lab.frame.paused);
 await page.locator('canvas').first().screenshot({path:'evidence/primo-variants-browser.png'});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/primo-variants-browser.json',JSON.stringify({errors,launched:['hydro','cryo','electro','pyro'],result},null,2));console.log('All four UI variants selected; pyro fields rendered');
}finally{await browser.close()}
