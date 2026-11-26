import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.LAB_URL||'http://127.0.0.1:9118/';
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const {quests,packing}=await read('content/daily-field-guide.json');
const routes=await read('content/daily-guide-routes.json');
const authored=await read('content/daily-quests.json'),checked=new Set();
assert.deepEqual(quests.map(q=>q.id),authored.quests.map(q=>q.id));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:820}});
 await page.goto(base+'daily-field-guide.html?quest='+quests.at(-1).id);
 await page.waitForFunction(id=>document.querySelector('#quest').value===id,quests.at(-1).id);
 for(const q of quests){
  await page.selectOption('#region',q.region);await page.selectOption('#quest',q.id);
  await page.waitForFunction(art=>document.querySelector('#source').dataset.art===art,q.art);
  assert.equal(new URL(await page.locator('#fieldMap').evaluate(a=>a.href)).searchParams.get('node'),q.node);
  assert.equal(new URL(await page.locator('#hubMap').evaluate(a=>a.href)).searchParams.get('node'),q.hub);
  const {outbound:legs,home}=routes[[q.hub,q.level,q.node].join('/')];
  assert.equal(home.at(-1).node,q.hub);
  assert.deepEqual(await page.locator('#routeHome li > a:first-child').evaluateAll(links=>links.map(a=>new URL(a.href).searchParams.get('node'))),home.map(step=>step.node));
  assert.equal(legs.at(-1).node,q.node);
  const rows=page.locator('#routeStops li');
  assert.deepEqual(await rows.allTextContents(),legs.map(step=>step.name+'（出発側の門）'+(step.requires?'　'+step.requires:'')));
  assert.deepEqual(await rows.locator('a:first-child').evaluateAll(links=>links.map(a=>new URL(a.href).searchParams.get('node'))),legs.map(step=>step.node));
  for(const [selector,steps] of [['#routeStops',legs],['#routeHome',home]]){
   const gates=await page.locator(selector+' li > a:last-child').evaluateAll(links=>links.map(a=>Object.fromEntries(new URL(a.href).searchParams)));
   assert.deepEqual(gates.map(g=>[g.node,g.to,+g.gateX,+g.gateY]),steps.map(s=>[s.from,s.node,s.x,s.y]));
  }
  if(checked.has(q.art))continue;
  checked.add(q.art);
  const sprite=await read('assets/'+q.art+'-idle-sprites.json');
  const verified=await page.evaluate(sprite=>{
   for(const profile of ['h48c32','h32c16']){
    const c=document.querySelector('#'+profile),ref=document.createElement('canvas');
    ref.width=c.width;ref.height=c.height;
    const ctx=ref.getContext('2d'),[,,w,h]=sprite.box,g=sprite.profiles[profile],k=Math.min((c.width-16)/w,(c.height-12)/h);
    const x=(c.width-w*k)/2,y=c.height-6-h*k,sx=w*k/g.width,sy=h*k/g.height;
    for(const [a,b,r,t,color] of g.runs){
     const x0=Math.round(x+a*sx),y0=Math.round(y+b*sy);
     ctx.fillStyle=color;ctx.fillRect(x0,y0,Math.round(x+(a+r)*sx)-x0,Math.round(y+(b+t)*sy)-y0);
    }
    if(c.toDataURL()!==ref.toDataURL())return false;
   }
   return true;
  },sprite);
  assert(verified,q.art);
 }
 assert.equal(checked.size,packing.sprites);
 await page.selectOption('#region','モンド');await page.selectOption('#quest','daily-mond-slimes');
 await page.waitForFunction(()=>document.querySelector('#source').dataset.art);
 await page.screenshot({path:'evidence/daily-field-guide.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/remaining-survey-save.json');
 await page.waitForFunction(()=>window.lab.frame.story?.node==='liyue-harbor' && document.querySelector('#saveStatus').textContent.includes('このブラウザにも保存'));
 await page.locator('#dailyBoard summary').click();
 const card=page.locator('#dailyChoices [data-daily-id]').first();
 await card.waitFor();
 const example=card.getByRole('link',{name:'対象例のフィールドとドット絵'});
 const newTab=page.waitForEvent('popup');
 await example.click();
 const guidePage=await newTab,id=await card.getAttribute('data-daily-id');
 await guidePage.waitForFunction(value=>document.querySelector('#quest')?.value===value,id);
 console.log(quests.length+' quests; '+checked.size+' sprites; both packed profiles and the in-game board link verified.');
}finally{await browser.close();}
