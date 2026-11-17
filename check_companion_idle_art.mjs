import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function checkCompanionIdleArt(id,comparisonIds){
 const catalog=JSON.parse(await fs.readFile('content/character-art-gallery.json','utf8'));
 const byId=Object.fromEntries(catalog.items.map(item=>[item.id,item]));
 const {name,height,file,leftFile}=byId[id];
 const readArt=file=>fs.readFile(`assets/${file}`,'utf8').then(JSON.parse);
 const artBySide={right:await readArt(file),left:await readArt(leftFile)};
 const source=side=>artBySide[side].source;
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
 const base=new URL(process.env.LAB_URL||'http://127.0.0.1:8769/');
 page.on('pageerror',e=>errors.push(e.message));

 try{
  await page.goto(base.href);await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('[data-action="campaign"]').click();
  await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
  await page.locator(`[data-action="companion:${id}"]`).click();
  await page.evaluate(()=>window.lab.action('swap'));
  await page.waitForFunction(()=>window.lab.frame.active===2);
  const poses=[];
  for(const [side,key] of [['right','KeyD'],['left','KeyA']]){
   await page.keyboard.down(key);
   const moving=await page.waitForFunction(file=>{
    const f=window.lab.frame,actor=f.actors[1],draw=f.draws.find(d=>d.source===file);
    return actor.walk!==0&&draw;
   },source(side));
   await page.keyboard.up(key);
   const waiting=await page.waitForFunction(file=>{
    const f=window.lab.frame,actor=f.actors[1],draw=f.draws.find(d=>d.source===file);
    return actor.walk===0&&draw&&{draw,x:actor.x-f.camera,y:actor.y};
   },source(side));
   const {draw,x,y}=await waiting.jsonValue();
   assert.deepEqual([draw.x,draw.y,draw.h,draw.flip],[x,y,height,false]);
   poses.push({side,moving:await moving.jsonValue(),waiting:draw});
  }
  await page.locator('#game').screenshot({path:`evidence/${id}-art-browser.png`});

  await page.goto(new URL('characters-art.html?q='+id,base).href);
  await page.waitForFunction(()=>window.charactersGallery?.ready);
  const gallerySource=()=>page.evaluate(id=>window.charactersGallery.dimensions.find(d=>d.id===id).source,id);
  assert.equal(await gallerySource(),source('right'));
  await page.check('#flip');assert.equal(await gallerySource(),source('left'));
  assert.equal(await page.evaluate(()=>window.charactersGallery.visibleCount),1);

  const comparison=await Promise.all(comparisonIds.map(async id=>[byId[id].name,await readArt(byId[id].file)]));
  const art=[...comparison,[`${name}・旧版`,await readArt(`${id}-idle-sprites.json`)],
   [`${name}・右向き`,artBySide.right],[`${name}・左向き`,artBySide.left]];
  await page.evaluate(async ({art,name})=>{
   const preview=document.createElement('section');preview.id='poseComparison';
   preview.style.cssText=`width:${art.length*222}px;padding:20px;background:#18363f;color:#f4f4de`;
   const heading=document.createElement('h2');heading.textContent=`${name}の待機絵 — 元PNGと44px・16色`;preview.append(heading);
   const row=document.createElement('div');row.style.cssText='display:flex;gap:10px';preview.append(row);
   for(const [name,data] of art){
    const card=document.createElement('div');card.style.cssText='background:#234c52;text-align:center;padding:8px';
    const caption=document.createElement('h3');caption.textContent=name;
    const canvas=document.createElement('canvas');canvas.width=196;canvas.height=204;canvas.style.cssText='width:196px;height:204px;background:#234c52;';
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    const h=158,w=h*data.box[2]/data.box[3],base=178,anchor=data.anchorX??.5;
    ctx.fillStyle='#b8ccbf';ctx.fillRect(0,base,196,1);
    const image=new Image();image.src='/assets/'+data.source;await image.decode();
    ctx.drawImage(image,...data.box,49-w*anchor,base-h,w,h);
    const profile=data.profiles.h32c16,sx=w/profile.width,sy=h/profile.height;
    for(const [x,y,rw,rh,color] of profile.runs){ctx.fillStyle=color;ctx.fillRect(147-w*anchor+x*sx,base-h+y*sy,rw*sx+.05,rh*sy+.05)}
    ctx.fillStyle='#f4f4de';ctx.font='12px sans-serif';ctx.textAlign='center';
    ctx.fillText('PNG',49,196);ctx.fillText('44px・16色',147,196);
    card.append(caption,canvas);row.append(card);
   }
   document.body.prepend(preview);
  },{art,name});
  await page.locator('#poseComparison').screenshot({path:`evidence/${id}-idle-proportions.png`});

  await page.goto(new URL('map-art.html?node=mond-town',base).href);
  await page.waitForFunction(()=>window.mapArt?.ready);
  await page.selectOption('#species',`character-${id}`);
  const canvas=page.locator('#png'),{width,height:canvasHeight}=await canvas.boundingBox();
  await canvas.click({position:{x:400/960*width,y:470/540*canvasHeight}});
  const placement=()=>page.evaluate(()=>({pose:window.mapArt.visuals.at(-1),item:window.mapArt.placements.at(-1)}));
  const right=await placement();assert.equal(right.pose.source,source('right'));
  await page.locator('#placements button').last().click();await page.locator('#flipSelected').click();
  const left=await placement();assert.equal(left.pose.source,source('left'));
  assert.deepEqual(left.item,{...right.item,flip:true});
  assert.deepEqual([left.pose.y,left.pose.height],[480,height]);
  assert.deepEqual(errors,[]);
  await fs.writeFile(`evidence/${id}-art-browser.json`,JSON.stringify({errors,poses,galleryBothFacings:true,mapFacing:{right,left}},null,2));
  console.log(`${id}: left/right PNG, actor anchor, stop, gallery and map placement passed`);
 }finally{await browser.close()}
}
