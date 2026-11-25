import fs from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1350,height:960}});
 const profiles=['legacy','h48c32','h32c16'],rows=[];
 for(const [node,label] of [['ninianne-legend-bank','ニニアン'],['vivianne-legend-bank','ヴィヴィアン']]){
  await page.goto((process.env.LAB_URL||'http://127.0.0.1:9117/')+'map-art.html?placements=live&node='+node);
  await page.waitForFunction(n=>window.mapArt?.node===n && window.mapArt.backgroundState==='ready',node);
  if(await page.locator('#decodedBackground').isChecked())await page.uncheck('#decodedBackground');
  const shots=[];
  const crop=id=>page.evaluate(id=>{
   const a=window.mapArt, v=a.visuals[0],e=a.placements[0];
   const size=Math.max(130,Math.ceil(v.height*1.65)),c=document.createElement('canvas');
   c.width=c.height=232;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
   ctx.drawImage(document.getElementById(id),Math.max(0,Math.min(960-size,Math.round(e.x-a.camera-size/2))),Math.max(0,Math.min(540-size,Math.round(v.y-v.height/2-size/2))),size,size,0,0,232,232);
   return c.toDataURL();
  },id);
  shots.push(await crop('png'));
  await page.locator('#compareSpriteProfiles').click();
  for(const p of profiles){await page.locator('#spriteProfileTable button[value="'+p+'"]').click();shots.push(await crop('rect'));}
  rows.push({label,shots,stats:await page.locator('#spriteProfileTable tbody tr').evaluateAll(rs=>rs.map(r=>r.cells[1].textContent+'矩形・'+r.cells[2].textContent))});
 }
 const data=await page.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=988;c.height=632;
  const ctx=c.getContext('2d');ctx.fillStyle='#10272d';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#e7f3ed';ctx.font='bold 18px "Yu Gothic UI",sans-serif';
  ['元PNG','標準','32色','16色'].forEach((s,i)=>ctx.fillText(s,12+i*245,25));
  for(const [j,row] of rows.entries()){
   const y=37+j*294;ctx.fillText(row.label,12,y+18);
   for(const [i,url] of row.shots.entries()){
    const im=new Image();im.src=url;await im.decode();ctx.drawImage(im,12+i*245,y+28);
    if(i)ctx.fillText(row.stats[i-1],12+i*245,y+284);
   }
  }
  return c.toDataURL();
 },rows);
 await fs.writeFile('evidence/ninianne-vivianne-profile-comparison.png',Buffer.from(data.split(',')[1],'base64'));
}finally{await browser.close();}
