import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {displayedTierHash} from './tools/browser_scenery_tier.mjs';
import {compareOpeningPixels} from './tools/browser_opening_pixels.mjs';

const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const graph=await read('content/story-graph.json'),nodes=new Map(graph.nodes.map(n=>[n.id,n]));
const {scenes}=await read('assets/natlan-southern-routes-background-generation.json');
const encoded=(await read('evidence/natlan-southern-routes-background-compression.json')).scenes;
const roster=(await read('content/field-boss-spawns.json')).fieldBosses;
const legends=roster.filter(b=>b.id.startsWith('legend-')&&nodes.get(b.node).region==='ナタ').map(b=>b.node).sort();
const pair='atocpan-battlegoat-ironclaw-field',fork='night-wind-seaward-fork',dawn='night-trial-fallen-dawnstar';
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const game=await browser.newPage({viewport:{width:1360,height:920}}),errors=[];
 const viewer=await browser.newPage({viewport:{width:1440,height:920}});
 for(const p of [game,viewer])p.on('pageerror',e=>errors.push(e.message));
 await game.goto(base);
 await game.waitForFunction(()=>window.lab?.frame);
 await game.locator('#importSave').setInputFiles('work/cap-fresh-route-draft/lv165-save.json');
 await game.waitForFunction(()=>window.lab.frame.progression?.level===165);
 await game.evaluate(()=>document.activeElement.blur());
 await game.keyboard.press('KeyM');await game.locator('#worldAtlas').waitFor();
 await game.selectOption('#atlasRegion','region-06');
 await game.waitForFunction(()=>window.lab.frame.worldMap?.region==='region-06');
 await game.selectOption('#atlasField',fork);
 await game.waitForFunction(n=>window.lab.frame.worldMap?.selected?.id===n,fork);
 const clickGate=async (link,source,edge)=>{
  const [popup]=await Promise.all([game.waitForEvent('popup'),link.click()]);
  try{
   await popup.waitForFunction(n=>window.mapArt?.node===n&&window.mapArt.backgroundState==='ready',source);
   const panel=popup.locator('#gatePreview');
   assert.ok(await panel.evaluate(el=>el.open));
   const i=nodes.get(source).exits.findIndex(e=>e.to===edge.to&&e.x===edge.x&&(e.y??480)===(edge.y??480));
   assert.equal(await panel.locator('select').inputValue(),String(i+1));
   const camera=Number(await popup.locator('#camera').inputValue()), y=edge.y??480;
   const rgb=await popup.evaluate(({x,y})=>['png','rect'].map(id=>
    [...document.getElementById(id).getContext('2d').getImageData(x,y,1,1).data]),{x:edge.x-camera,y:y-8});
   assert.deepEqual(rgb,[[255,230,128,255],[255,230,128,255]]);
   assert.equal(new URL(await panel.locator('a').getAttribute('href'),base).searchParams.get('node'),edge.to);
   return {source,to:edge.to,x:edge.x,y,camera};
  }finally{await popup.close()}
 };
 const testedGates=[];
 for(const target of ['night-wind-rilai-clearing',dawn]){
  const edge=nodes.get(fork).exits.find(e=>e.to===target);
  testedGates.push(await clickGate(game.locator('#atlasRoutes a[href*="to='+target+'&"]'),fork,edge));
 }
 await game.selectOption('#atlasField','atocpan-peak-cave');
 await game.waitForFunction(()=>window.lab.frame.worldMap?.selected?.id==='atocpan-peak-cave');
 const trail='atocpan-peak-rock-trail',peak=nodes.get(trail).exits.find(e=>e.to==='atocpan-peak-cave');
 testedGates.push(await clickGate(game.locator('#atlasItineraryStops a[href*="to=atocpan-peak-cave&"]'),trail,peak));

 const stages=[],pictures=[],bodyDiffs={};
 for(const {node,source} of scenes){
  const query=new URLSearchParams({node,placements:'live',arena:'legend',region:'ナタ',measured:'1',tier:'4096',compare:'background'});
  await viewer.goto(base+'map-art.html?'+query);
  await viewer.waitForFunction(source=>window.mapArt?.backgroundFile===source&&window.mapArt.decodedBackgroundRectangles===4096,source);
  assert.deepEqual(await viewer.locator('#nodeSearchResults [data-node]').evaluateAll(els=>els.map(el=>el.dataset.node).sort()),legends);
  const pic=id=>viewer.locator('#'+id).evaluate(c=>c.toDataURL());
  const row={name:nodes.get(node).name,images:[await pic('png'),await pic('rect')]};
  const sizes={};
  for(const tier of encoded[source].tiers){
   const n=tier.rectangles;
   await viewer.selectOption('#backgroundTier',String(n));
   await viewer.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,n);
   assert.equal(await displayedTierHash(viewer,n),tier.rgbSha256);
   const link=viewer.locator('#sceneryDownload[download$="-'+n+'.lua"]');await link.waitFor();
   sizes[n]=await link.evaluate(async a=>(await(await fetch(a.href)).blob()).size);
  }
  row.images.push(await pic('rect'));pictures.push(row);
  stages.push({node,source,sizes});
  if(node===pair){
   const initial=await viewer.evaluate(()=>window.mapArt);
   assert.equal(initial.count,2);
   const refs=await read('work/group-legend-openings/'+pair+'.json');
   const shifted=marks=>marks.map(m=>({...m,x:m.x+refs.camera-initial.camera}));
   await viewer.uncheck('#matchSpritePng');await viewer.uncheck('#decodedBackground');
   for(const profile of ['legacy','h48c32','h32c16']){
    await viewer.selectOption('#profile',profile);
    bodyDiffs[profile]=await compareOpeningPixels(viewer,shifted(refs.png),shifted(refs[profile]),nodes.get(node),initial.camera);
    assert.deepEqual(bodyDiffs[profile],{png:0,rect:0});
   }
  }
 }

 // Two physical gates to one destination must preserve the chosen side; a voyage arrival has no gate.
 for(const edge of nodes.get('ina-sayu-watchpath').exits.filter(e=>e.to==='inazuma-town')){
  const params=new URLSearchParams({node:'ina-sayu-watchpath',to:edge.to,gateX:edge.x,gateY:edge.y??480,placements:'live'});
  await viewer.goto(base+'map-art.html?'+params);
  await viewer.waitForFunction(()=>window.mapArt?.ready);
  const expected=nodes.get('ina-sayu-watchpath').exits.indexOf(edge)+1;
  assert.equal(await viewer.locator('#gatePreview select').inputValue(),String(expected));
 }
 await viewer.goto(base+'map-art.html?node=liyue-ferry&placements=live&to=inazuma-port&gateX=0&gateY=480');
 await viewer.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await viewer.locator('#gatePreview select').inputValue(),'');
 await viewer.goto(base+'map-art.html?node=fon-toy-shallows&placements=live&to=fontaine-hub&gateX=86&gateY=155');
 await viewer.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await viewer.locator('#gatePreview output').textContent(),'水中（86, 155）');
 const source=nodes.get('mond-roadside-rest'),edge=source.exits.find(e=>e.to==='mond-wp-20');
 const request=new URLSearchParams({node:source.id,placements:'live',to:edge.to,gateX:edge.x,gateY:edge.y??480,background:'original',tier:'4096'});
 await viewer.goto(base+'map-art.html?'+request);
 await viewer.waitForFunction(()=>window.mapArt?.ready);
 await viewer.selectOption('#profile','h48c32');
 await viewer.locator('#gatePreview a').click();
 await viewer.waitForFunction(id=>window.mapArt?.ready&&window.mapArt.node===id,edge.to);
 assert.equal(await viewer.locator('#profile').inputValue(),'h48c32');
 assert.equal(await viewer.locator('#decodedBackground').isChecked(),false);
 assert.equal(await viewer.locator('#backgroundTier').inputValue(),'4096');
 assert.equal(await viewer.evaluate(()=>window.mapArt.camera),Math.min(nodes.get(edge.to).width-960,edge.arrivalX-480));
 const sheet=await viewer.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=1260;c.height=36+rows.length*260;
  const ctx=c.getContext('2d');ctx.fillStyle='#18272d';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#f1ead6';ctx.font='bold 17px "Yu Gothic UI",sans-serif';
  ['元の背景','4,096矩形','6,144矩形'].forEach((s,i)=>ctx.fillText(s,8+i*420,25));
  for(const [i,row] of rows.entries()){
   const y=36+i*260;ctx.fillText(row.name,8,y+18);
   for(const [j,url] of row.images.entries()){
    const im=new Image();im.src=url;await im.decode();ctx.drawImage(im,j*420+5,y+23,409,230);
   }
  }
  return c.toDataURL();
 },pictures);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/southern-legend-comparison.png',Buffer.from(sheet.split(',')[1],'base64'));
 await fs.writeFile('evidence/southern-legend-routes-browser.json',JSON.stringify({stages,regionalArenas:legends,testedGates,bodyDiffs},null,2)+'\n');
 console.log('Six environments, all Natlan legend filters, three M-map entrance links and the paired opening passed.');
}finally{await browser.close()}
