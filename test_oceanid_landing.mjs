import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/oceanid-harbor-fixture.json','utf8'));await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='liyue-harbor');
 const panel=page.locator('#encountersPanel');await panel.locator('summary').click();await panel.getByLabel('ボス名で検索').fill('純水精霊');await panel.getByRole('button',{name:'試作に挑戦'}).click();await page.waitForFunction(()=>window.lab.frame.boss?.name==='純水精霊（試作素材）');
 await page.route('**/api/frame',route=>route.request().headers()['x-playtest']?route.continue():route.abort());
 const result=await page.evaluate(async()=>{
  const session=window.lab.frame.session;let f=window.lab.frame;
  for(let i=0;i<1500;i++){
   const b=f.boss,a=f.actors[0];if(!b)throw Error('encounter ended');
   if((b.mimics||[]).some(e=>e.kind==='raptor'&&e.state==='recover'&&e.y>420)){
    await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json','X-Playtest':'1'},body:JSON.stringify({session,steps:0,actions:['pause']})});return {boss:b,actor:a,requests:i};
   }
   const targets=Array.isArray(b.mimics)?b.mimics:[];targets.sort((x,y)=>Math.abs(x.x-a.x)-Math.abs(y.x-a.x));const target=targets[0];
   const desired=target?Math.max(240,Math.min(720,target.x-55)):480;
   const near=target&&Math.abs(a.x-target.x)<130&&Math.abs(a.y-target.y)<75;
   const actions=[];if(a.lock<=0){if(a.hp<a.maxhp*.85&&!(a.cd.SK18>0))actions.push('slot5');else if(near&&(target.x-a.x)*a.dir>0&&b.wave<4){for(const [slot,key] of [[3,'SK21'],[4,'SK25'],[1,'SK05'],[2,'SK07']]){if(!(a.cd[key]>0)){actions.push('slot'+slot);break}}}};
   const jump=!!target&&(target.kind==='raptor'||target.state==='warning');if(jump&&a.ground)actions.push('jump');
   const r=await fetch('/api/frame',{method:'POST',headers:{'Content-Type':'application/json','X-Playtest':'1'},body:JSON.stringify({session,steps:6,actions,input:{left:a.x>desired+6,right:a.x<desired-6||(Math.abs(a.x-desired)<=6&&a.dir<0),attack:b.wave<4,jump}})});
   if(!r.ok)throw Error('frame '+r.status);f=await r.json();
  }throw Error('raptor landing not reached');
 });
 await page.unroute('**/api/frame');
 await page.waitForFunction(()=>window.lab.frame.paused&&window.lab.frame.boss?.phase==='mimics');await page.locator('canvas').first().screenshot({path:'evidence/oceanid-landing-browser.png'});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/oceanid-landing-browser.json',JSON.stringify({errors,result,method:'Lv20 Amber fixture; automatic UI polling suspended during accelerated input test, UI boss launch, normal frame API actions/movement, accelerated; no direct state mutation'},null,2));console.log('Raptor reached visible ground recovery through input actions');
}finally{await browser.close()}
