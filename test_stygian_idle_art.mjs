import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base=new URL(process.env.LAB_URL||'http://127.0.0.1:8769/');
const profiles=['legacy','h48c32','h32c16'];
const cases={
 'capitano-coat':{prefix:'capitano-coat',height:152},
 xbalanque:{prefix:'xbalanque-idle',height:84},
 rerir:{prefix:'rerir-idle',height:144,node:'nod-field',background:'nodkrai-background-v1.png'},
};
const ids=process.argv.slice(2);
const selected=ids.length?Object.entries(cases).filter(([id])=>ids.includes(id)):Object.entries(cases);
assert(selected.length&&ids.every(id=>Object.hasOwn(cases,id)),'Unknown Stygian art selection');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 for(const [id,{prefix,height:displayHeight,node='natlan-entry',background='natlan-background-v1.png'}] of selected){
  const image=side=>`${prefix}-${side}-source-v1.png`;
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL(`bosses-art.html?q=${id}`,base).href);
  await page.waitForFunction(()=>window.charactersGallery?.ready);
  assert.equal(await page.evaluate(()=>window.charactersGallery.visibleCount),1);
  const directions=[];
  for(const side of ['right','left']){
   const encoding=JSON.parse(await fs.readFile(`assets/${prefix}-${side}-sprites-v1.json`,'utf8'));
   await page.locator('#flip').setChecked(side==='left');
   for(const [i,profile] of profiles.entries()){
    await page.selectOption('#profile',profile);
    const sprite=await page.evaluate(id=>window.charactersGallery.dimensions.find(d=>d.id===id),id);
    assert.equal(sprite.source,image(side));
    assert.equal(sprite.h,displayHeight);
    assert(Math.abs(sprite.w/sprite.h-sprite.ratio)<1e-9);
    const {height,colors,runs}=encoding.profiles[profile];
    assert.equal(height,[displayHeight,Math.round(displayHeight*.75),displayHeight/2][i]);
    assert.equal(colors,[32,32,16][i]);
    directions.push({side,profile,rectangles:runs.length});
   }
  }
  await page.goto(new URL(`map-art.html?node=${node}`,base).href);
  await page.waitForFunction(()=>window.mapArt?.ready,null,{timeout:60000});
  const canvas=page.locator('#png');
  const {width,height}=await canvas.boundingBox();
  const placements=id==='xbalanque'?
   [['character-traveler',155],['boss-'+id,365],['boss-'+id,560],['boss-capitano-coat',795]]:
   [['boss-'+id,270],['boss-'+id,655]];
  for(const [index,[species,x]] of placements.entries()){
   await page.selectOption('#species',species);
   await canvas.click({position:{x:x/960*width,y:478/540*height}});
   const reverse=id==='xbalanque'?index===2:index===1;
   if(reverse){
    await page.locator('#placements button').last().click();
    await page.locator('#flipSelected').click();
    await page.locator('#clearSelection').click();
   }
  }
  const expected=[[image('right'),displayHeight,480],[image('left'),displayHeight,480]];
  if(id==='xbalanque'){
   expected.unshift(['traveler-idle-source-v3.png',88,480]);
   expected.push(['capitano-coat-right-source-v1.png',152,480]);
  }
  const map=()=>page.evaluate(()=>window.mapArt);
  for(const profile of profiles){
   await page.selectOption('#profile',profile);
   const state=await map();
   assert.equal(state.grounded,true);
   assert.equal(state.backgroundFile,background);
   assert.equal(state.backgroundState,'ready');
   assert.deepEqual(state.visuals.slice(-expected.length).map(v=>[v.source,v.height,v.y]),expected);
  }
  await page.locator('main').screenshot({path:`evidence/${prefix}-map-comparison.png`});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  await fs.writeFile(`evidence/${prefix}-browser.json`,JSON.stringify({directions,map:await map(),mobileOverflow:false,errors},null,2));
  console.log(`${id}: both directions and three profiles, shared floor and background at ${node} passed`);
  await page.close();
 }
}finally{await browser.close()}
