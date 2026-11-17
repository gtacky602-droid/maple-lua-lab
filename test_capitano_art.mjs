import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base=new URL(process.env.LAB_URL||'http://127.0.0.1:8769/');
const profiles=['legacy','h48c32','h32c16'];
const image=side=>`capitano-coat-${side}-source-v1.png`;
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('bosses-art.html?q=capitano-coat',base).href);
 await page.waitForFunction(()=>window.charactersGallery?.ready);
 assert.equal(await page.evaluate(()=>window.charactersGallery.visibleCount),1);
 const directions=[];
 for(const side of ['right','left']){
  const encoding=JSON.parse(await fs.readFile(`assets/capitano-coat-${side}-sprites-v1.json`,'utf8'));
  await page.locator('#flip').setChecked(side==='left');
  for(const [i,profile] of profiles.entries()){
   await page.selectOption('#profile',profile);
   const sprite=await page.evaluate(()=>window.charactersGallery.dimensions.find(d=>d.id==='capitano-coat'));
   assert.equal(sprite.source,image(side));
   assert.equal(sprite.h,152);
   assert(Math.abs(sprite.w/sprite.h-sprite.ratio)<1e-9);
   const {height,colors,runs}=encoding.profiles[profile];
   assert.equal(height,[152,114,76][i]);
   assert.equal(colors,[32,32,16][i]);
   directions.push({side,profile,rectangles:runs.length});
  }
 }
 await page.goto(new URL('map-art.html?node=natlan-entry',base).href);
 await page.waitForFunction(()=>window.mapArt?.ready,null,{timeout:60000});
 await page.selectOption('#species','boss-capitano-coat');
 const canvas=page.locator('#png');
 const {width,height}=await canvas.boundingBox();
 for(const x of [270,655]){
  await canvas.click({position:{x:x/960*width,y:478/540*height}});
 }
 await page.locator('#placements button').last().click();
 await page.locator('#flipSelected').click();
 await page.locator('#clearSelection').click();
 const map=()=>page.evaluate(()=>window.mapArt);
 for(const profile of profiles){
  await page.selectOption('#profile',profile);
  const state=await map();
  assert.equal(state.grounded,true);
  assert.equal(state.backgroundFile,'natlan-background-v1.png');
  assert.equal(state.backgroundState,'ready');
  assert.deepEqual(state.visuals.slice(-2).map(v=>[v.source,v.height,v.y]),[
   [image('right'),152,480],[image('left'),152,480],
  ]);
 }
 await page.locator('main').screenshot({path:'evidence/capitano-coat-map-comparison.png'});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/capitano-coat-browser.json',JSON.stringify({directions,map:await map(),mobileOverflow:false,errors},null,2));
 console.log('Capitano: both directions and three profiles, shared Natlan floor and background passed');
}finally{await browser.close()}
