import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {displayedTierHash} from './tools/browser_scenery_tier.mjs';

const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const graph=await read('content/story-graph.json');
const nodes=new Map(graph.nodes.map(n=>[n.id,n]));
const openings=await read('content/group-legend-openings.json');
const [scene]=(await read('assets/natlan-night-trials-background-generation.json')).scenes;
const tiers=(await read('evidence/natlan-night-trials-background-compression.json')).scenes[scene.source].tiers;
const arenas=[scene.node,...scene.sharedNodes].sort();
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:920}});
 const shaByTier={},encounters=[],pictures=[],comparison=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const node of arenas){
  const entrance=nodes.get(node).exits.find(e=>e.nightTotem==='return').to;
  await page.goto(base+'map-art.html?'+new URLSearchParams({node,placements:'live',arena:'nightTrial',compare:'background',tier:'4096'}));
  await page.waitForFunction(source=>window.mapArt?.backgroundFile===source&&window.mapArt.decodedBackgroundRectangles===4096,scene.source);
  const matches=await page.locator('#nodeSearchResults [data-node]').evaluateAll(els=>els.map(e=>e.dataset.node).sort());
  assert.deepEqual(matches,arenas);
  const visuals=await page.evaluate(()=>window.mapArt.visuals);
  const parts=openings[node].parts;
  assert.deepEqual(visuals.map(v=>v.height),parts.map(p=>p.h));
  const name=parts[0].name;
  pictures.push({name,image:await page.locator('#rect').evaluate(c=>c.toDataURL())});
  if(node===arenas[0]){
   comparison.push({name:name+' ／ 元の背景',image:await page.locator('#png').evaluate(c=>c.toDataURL())});
   comparison.push({name:'4,096矩形',image:pictures.at(-1).image});
  }
  for(const {rectangles,rgbSha256} of tiers){
   await page.selectOption('#backgroundTier',String(rectangles));
   await page.waitForFunction(n=>window.mapArt?.decodedBackgroundRectangles===n,rectangles);
   assert.equal(await displayedTierHash(page,rectangles),rgbSha256);
   const link=page.locator('#sceneryDownload[download$="-'+rectangles+'.lua"]');
   await link.waitFor();
   const source=await link.evaluate(async a=>(await fetch(a.href)).text());
   const sha=createHash('sha256').update(source).digest('hex');
   shaByTier[rectangles]??=sha;
   assert.equal(shaByTier[rectangles],sha);
  }
  if(node===arenas[0])comparison.push({name:'6,144矩形',image:await page.locator('#rect').evaluate(c=>c.toDataURL())});
  if(node==='night-trial-ichcahuipilli'){
   await page.locator('#legendAccess summary').click();
   assert.match(await page.locator('#legendAccess').innerText(),/三つの光/);
   assert.doesNotMatch(await page.locator('#legendAccess').innerText(),/を報告/);
  }
  const link=page.locator('#nightTrialPassage a').first();
  await link.click();
  await page.waitForFunction(id=>window.mapArt?.node===id,entrance);
  if(node==='night-trial-tlatzacuilotl'){
   await page.locator('#legendAccess summary').click();
   assert.match(await page.locator('#legendAccess').innerText(),/刻印板の順/);
  }
  assert.equal(new URL(page.url()).searchParams.get('tier'),'6144');
  await link.click();
  await page.waitForFunction(id=>window.mapArt?.node===id&&window.mapArt.decodedBackgroundRectangles===6144,node);
  encounters.push({node,entrance,name,visuals});
  console.log(node);
 }
 assert.deepEqual(errors,[]);
 assert.equal(new Set(Object.values(shaByTier)).size,5);
 const sheet=await page.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=1200;c.height=Math.ceil(rows.length/3)*253;
  const ctx=c.getContext('2d');ctx.fillStyle='#18122d';ctx.fillRect(0,0,c.width,c.height);
  ctx.font='bold 16px "Yu Gothic UI",sans-serif';ctx.fillStyle='#f2edff';
  for(const [i,row] of rows.entries()){
   const x=i%3*400,y=Math.floor(i/3)*253;
   const im=new Image();im.src=row.image;await im.decode();
   ctx.fillText(row.name,x+6,y+20);ctx.drawImage(im,x+4,y+26,392,221);
  }
  return c.toDataURL();
 },[...comparison,...pictures]);
 await fs.writeFile('evidence/night-trial-openings.png',Buffer.from(sheet.split(',')[1],'base64'));
 await fs.writeFile('evidence/night-trial-arenas-browser.json',JSON.stringify({encounters,shaByTier,verifiedStageTierPairs:arenas.length*tiers.length},null,2)+'\n');
 console.log('12 distinct entrances, 60 stage/tier comparisons and five shared Lua modules verified.');
}finally{await browser.close()}
