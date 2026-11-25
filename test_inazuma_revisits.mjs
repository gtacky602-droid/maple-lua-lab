import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:960}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.evaluate(()=>window.lab.frame);
const wait=(fn,arg)=>page.waitForFunction(fn,arg,{timeout:30000});
const canvas=page.locator('#game');
async function walk(x){
 const f=await frame(),a=f.actors[f.active-1];
 if(Math.abs(x-a.x)<8)return;
 const right=x>a.x,code=right?'KeyD':'KeyA';
 await canvas.click();await page.keyboard.down(code);
 try{
  await wait(({x,right})=>{
   const f=window.lab.frame,a=f.actors[f.active-1];
   return right?a.x>=x-7:a.x<=x+7;
  },{x,right});
 }finally{await page.keyboard.up(code)}
}
async function gate(x,node){
 await walk(x);
 await wait(node=>{const p=window.lab.frame.storyNearbyPortal;return p?.to===node&&p.available},node);
 await canvas.click();await page.keyboard.press('KeyF');
 await wait(node=>window.lab.frame.story.node===node,node);
}
async function picture(){
 return page.evaluate(()=>{
  const f=window.lab.frame,c=document.createElement('canvas');
  c.width=124;c.height=108;
  c.getContext('2d').drawImage(document.getElementById('game'),763-f.camera-56,378,124,108,0,0,124,108);
  return c.toDataURL();
 });
}
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9118/');
 await wait(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('evidence/inazuma-revisit-save.json');
 await wait(()=>window.lab.frame.story?.node==='inazuma-town'&&window.lab.frame.companion?.id==='ayaka');
 await page.locator('#storyLanternNotes summary').click();
 const stops=page.locator('#ayakaRevisitMap [data-revisit]');
 assert.equal(await stops.count(),5);
 await page.locator('[data-revisit="ina-tea-landing"]').click();
 await wait(()=>window.lab.frame.worldMap?.selected?.id==='ina-tea-landing');
 await page.keyboard.press('Escape');
 await wait(()=>!window.lab.frame.worldMap);
 await walk(790);
 const line=page.locator('#ayakaRevisit');
 await line.waitFor();
 assert.match(await line.innerText(),/屋根越しの高台/);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await line.evaluate(e=>e.scrollWidth<=e.clientWidth));
 await page.setViewportSize({width:1280,height:960});
 await gate(940,'inazuma-forest-shore');await line.waitFor({state:'hidden'});
 await gate(850,'inazuma-sea-cave');
 await gate(1335,'inazuma-shiomi-cape');
 await walk(560);
 await page.locator('#renderMode').selectOption('h32c16');
 await wait(()=>window.lab.frame.commands>500&&window.lab.frame.storyContest?.greeting==='lantern');
 const shots=[await picture()];
 await canvas.click();await page.keyboard.down('KeyD');
 try{await wait(()=>window.lab.frame.storyContest?.greeting==='sway')}finally{await page.keyboard.up('KeyD')}
 await wait(()=>window.lab.frame.storyContest?.greeting==='unmask');
 const beforeHop=(await frame()).t;
 await wait(t=>window.lab.frame.t>=t+.22&&window.lab.frame.storyContest?.greeting==='unmask',beforeHop);
 shots.push(await picture());
 await wait(()=>window.lab.frame.storyContest?.greeting==='rest');
 shots.push(await picture());
 await walk(675);
 await canvas.click();await page.keyboard.press('KeyG');
 await page.locator('#capeVista').waitFor();
 await page.locator('#capeVista button').click();
 await page.locator('#capeVista').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 const gallery=await browser.newPage({viewport:{width:780,height:240}});
 await gallery.setContent('<style>*{box-sizing:border-box}body{margin:0;background:#193438;color:#fff0cb;font:16px system-ui}main{display:flex;gap:6px;padding:10px}figure{margin:0}img{display:block;width:248px;height:216px;image-rendering:pixelated}figcaption{padding:3px 0 7px}</style><main></main>');
 await gallery.evaluate(async shots=>{
  for(const [i,label] of ['灯籠のしっぽ','葉を放して跳ねる親分','岬でひと休み'].entries()){
   const fig=document.createElement('figure'),caption=document.createElement('figcaption'),img=new Image();
   caption.textContent=label;img.src=shots[i];await img.decode();fig.append(caption,img);document.querySelector('main').append(fig);
  }
 },shots);
 await gallery.locator('main').screenshot({path:'evidence/inazuma-cape-greeting.png'});
 const proof={saveFileImported:true,notebookPlaces:5,mapFocus:'ina-tea-landing',bridgeFavorite:true,dialogueFits390px:true,clearedChapterGates:3,
   greetingSeen:['lantern','sway','unmask','rest'],vistaOpensAndCloses:true,profile:'h32c16',errors};
 await fs.writeFile('evidence/inazuma-revisits-browser.json',JSON.stringify(proof,null,2)+'\n');console.log(proof);
}finally{await browser.close()}
