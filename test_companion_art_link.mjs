import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const base=new URL(process.env.LAB_URL||'http://127.0.0.1:19745/');
const catalog=JSON.parse(await readFile('content/character-art-gallery.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1100,height:820}});
 const gallery=await browser.newPage({viewport:{width:320,height:780}});
 const errors=[];
 for(const tab of [page,gallery])tab.on('pageerror',error=>errors.push(error.message));
 await page.bringToFront();
 await page.goto(base.href);
 await page.waitForFunction(()=>window.lab?.frame);
 await page.selectOption('#renderMode','sprite');
 await page.locator('[data-action="campaign"]').click();
 await page.waitForFunction(()=>window.lab?.frame.campaign?.zone==='town');
 const link=page.locator('#companionArtLink');
 const ids=(await page.locator('[data-action^="companion:"]').evaluateAll(buttons=>
  buttons.map(button=>button.dataset.action.split(':')[1])));
 assert.equal(ids.length,8);
 for(const id of ids){
  await page.locator(`[data-action="companion:${id}"]`).click();
  await page.waitForFunction(id=>window.lab.frame.companion.id===id,id);
  const entry=catalog.items.find(item=>item.id===id);
  if(await page.evaluate(()=>window.lab.frame.active)!==2){
   await page.evaluate(()=>window.lab.action('swap'));
   await page.waitForFunction(()=>window.lab.frame.active===2);
  }
  for(const [dir,key] of [[1,'KeyD'],[-1,'KeyA']]){
   await page.bringToFront();
   const left=dir<0&&entry.leftFile;
   const art=JSON.parse(await readFile('assets/'+(left||entry.file),'utf8'));
   await page.keyboard.down(key);
   try{
    await page.waitForFunction(dir=>{
     const a=window.lab.frame.actors[1];
     return a.dir===dir&&a.walk!==0;
    },dir);
   }finally{await page.keyboard.up(key)}
   const draw=await page.waitForFunction(data=>{
    const frame=window.lab.frame,a=frame.actors[1];
    return frame.draws.find(d=>d.source===data.source&&Math.abs(d.x-(a.x-frame.camera))<.01);
   },art);
   const {h,flip,source}=await draw.jsonValue();
   assert.equal(h,entry.height);
   assert.equal(flip,dir<0&&!left);
   const url=new URL(await link.getAttribute('href'),base);
   assert.equal(url.searchParams.get('q'),id);
   assert.equal(url.searchParams.has('flip'),dir<0);
   await gallery.goto(url.href);
   await gallery.waitForFunction(()=>window.charactersGallery?.ready);
   const card=gallery.locator('#cards article:visible');
   assert.equal(await card.count(),1);
   const sizing=await card.locator('.pair canvas:visible').evaluateAll(canvases=>canvases.map(c=>({pixels:c.width,display:c.getBoundingClientRect().width})));
   assert.equal(sizing.length,3);
   assert(sizing.every(({pixels,display})=>Math.abs(display-pixels)<.01),JSON.stringify(sizing));
   const dims=await gallery.evaluate(id=>window.charactersGallery.dimensions.find(d=>d.id===id),id);
   assert.equal(dims.source,source);
   assert.equal(dims.h,h);
   const stats=await card.locator('.stats').innerText();
   assert(stats.includes(dir>0?'右向き':left?'左向き専用の絵':'左右反転'));
   console.log(id,dir,h,stats);
  }
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close()}
