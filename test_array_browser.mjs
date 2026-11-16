import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('恒常からくり陣形');await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss?.name==='恒常からくり陣形');
 await page.route('**/api/frame',route=>route.request().headers()['x-playtest']?route.continue():route.abort());
 await page.evaluate(async()=>{const session=window.lab.frame.session;let f=window.lab.frame,desired=50,lastPhase="";for(let i=0;i<800;i++){if(f.boss?.phase==='split'){await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json','X-Playtest':'1'},body:JSON.stringify({session,steps:0,actions:['pause']})});return;}const a=f.actors[f.active-1];if(f.boss.phase!==lastPhase){lastPhase=f.boss.phase;if(lastPhase.endsWith('_warning'))desired=a.x<480?Math.min(920,a.x+320):Math.max(40,a.x-320);}const actions=[];if(f.boss.phase.endsWith('_warning')&&f.boss.timer<.35&&a.ground)actions.push('jump');const r=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json','X-Playtest':'1'},body:JSON.stringify({session,steps:6,actions,input:{left:a.x>desired+6,right:a.x<desired-6}})});f=await r.json();if(!f.boss)throw Error('encounter ended');}throw Error('split not reached');});
 await page.unroute('**/api/frame');await page.waitForFunction(()=>window.lab.frame.paused&&window.lab.frame.boss?.phase==='split');
 await page.waitForFunction(()=>window.lab.frame.paused);
 await page.locator('canvas').first().screenshot({path:'evidence/array-browser.png'});
 const boss=await page.evaluate(()=>window.lab.frame.boss);if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/array-browser.json',JSON.stringify({errors,boss,method:'UI launch, accelerated ordinary frame API and left movement; split display, not a complete playthrough'},null,2));console.log('Array UI smoke passed');
}finally{await browser.close()}
