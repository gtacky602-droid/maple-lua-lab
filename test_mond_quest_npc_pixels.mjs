import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';

// Input is written by test_mond_quest_npc_packing.py --capture <path>.
const rows=JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const browser=await chromium.launch({channel:'chrome'});
try {
 const page=await browser.newPage();
 await page.goto((process.env.LAB_URL || 'http://127.0.0.1:9125')+'/sprite-images.js');
 await page.evaluate(()=>{
  document.body.replaceChildren();
  const canvas=document.createElement('canvas');
  canvas.width=890; canvas.height=530;
  document.body.append(canvas);
  const c=canvas.getContext('2d');
  c.fillStyle='#233343';c.fillRect(0,0,890,530);
  c.fillStyle='white';c.font='bold 22px sans-serif';c.fillText('モンドのクエストで見る仲間のドット絵',20,34);
  c.font='16px sans-serif';
  ['元のPNG','標準','32色','16色・圧縮前','16色・圧縮後'].forEach((s,i)=>c.fillText(s,175+i*140,68));
 });
 for(const row of rows){
  const diff=await page.evaluate(async r=>{
   const {drawCombatRect,drawCombatRuns}=await import('/sprite-images.js');
   function render(draws){
    const canvas=document.createElement('canvas');
    canvas.width=960;canvas.height=540;
    const ctx=canvas.getContext('2d');
    for(const d of draws){
     ctx.globalAlpha=d.opacity??1;
     if(d.kind==='rect')drawCombatRect(ctx,d);
     else if(d.kind==='rect_runs')drawCombatRuns(ctx,d,r.batches[d.batch-1]);
    }
    return canvas;
   }
   const plain=render(r.reference),packed=render(r.packed);
   const pixels=c=>c.getContext('2d').getImageData(0,0,960,540).data;
   const a=pixels(plain),b=pixels(packed);
   const dst=document.querySelector('canvas').getContext('2d');
   const index=['standing','seated','ledge','depth'].indexOf(r.scene);
   const top=76+index*111;
   const column={legacy:1,h48c32:2,h32c16:4}[r.profile];
   const paint=(canvas,col)=>dst.drawImage(canvas,Math.round(r.sprite.x)-64,r.sprite.y-102,128,108,164+col*140,top,128,108);
   paint(packed,column);
   if(column===4)paint(plain,3);
   if(column===1){
    const im=new Image();im.src='/assets/'+r.sprite.source;await im.decode();
    const d=r.sprite;
    const x=164+64+d.x-Math.round(d.x)-(d.anchorX??.5)*d.w;
    dst.drawImage(im,...d.box,x,top+102-d.h,d.w,d.h);
    dst.fillStyle='#e9eff1';dst.font='16px sans-serif';
    dst.fillText(['ノエル・立ち姿','ノエル・休憩中','ベネット・洞窟入口','ベネット・洞窟下層'][index],12,top+62);
   }
   return a.some((v,i)=>v!==b[i]);
  },row);
  assert.equal(diff,false,row.scene+' '+row.profile);
 }
 await page.locator('canvas').screenshot({path:'evidence/mond-quest-npc-comparison.png'});
} finally {await browser.close();}
