import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {compareOpeningPixels} from './tools/browser_opening_pixels.mjs';

const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const scenes=await read('content/stygian-openings.json');
const matches=(await read('content/stygian-matches.json')).matches;
const graph=await read('content/story-graph.json');
assert.deepEqual(Object.keys(scenes).sort(),Object.values(matches).map(m=>m.node).sort());
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
try{
 const page=await browser.newPage({viewport:{width:1440,height:940}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab?.frame.story.active);
 await page.keyboard.press('KeyM');
 const verified={},pictures=[];
 for(const [id,scene] of Object.entries(scenes)){
  await page.bringToFront();
  const back=page.locator('#atlasWorld');await back.waitFor();
  await back.evaluate(b=>{if(!b.disabled)b.click()});
  await page.waitForFunction(()=>window.lab.frame.worldMap?.region==='world');
  await page.selectOption('#atlasLayer','boss');
  await page.waitForFunction(()=>window.lab.frame.worldMap?.layer==='boss');
  await page.selectOption('#atlasField',id);
  const link=page.locator('#atlasBackgroundCompare[href*="'+id+'"]');
  const [viewer]=await Promise.all([page.waitForEvent('popup'),link.click()]);
  viewer.on('pageerror',e=>errors.push(e.message));
  await viewer.waitForFunction(id=>window.mapArt?.node===id&&window.mapArt.ready&&window.mapArt.backgroundState==='ready',id);
  const initial=await viewer.evaluate(()=>window.mapArt);
  assert.equal(initial.count,scene.parts.length);
  await viewer.locator('#stygianRules summary').click();
  const rules=await viewer.locator('#stygianRules tbody tr').allTextContents();
  assert.deepEqual(rules,matches[scene.match].modes.map(m=>m.name+m.level+m.hp.toLocaleString('ja-JP')));
  const source=initial.backgroundFile,stem=source.replace('-background-v1.png','');
  const refs=await read('work/stygian-openings/'+id+'.json');
  const node=graph.nodes.find(n=>n.id===id);
  const translate=draws=>draws.map(d=>({...d,x:d.x+refs.camera-initial.camera}));
  await viewer.locator('#matchSpritePng').uncheck();await viewer.locator('#decodedBackground').uncheck();
  const profiles={};
  for(const profile of ['legacy','h48c32','h32c16']){
   await viewer.selectOption('#profile',profile);
   const diff=await compareOpeningPixels(viewer,translate(refs.png),translate(refs[profile]),node,initial.camera);
   assert.deepEqual(diff,{png:0,rect:0},id+' '+profile+' '+JSON.stringify(diff));
   await viewer.locator('#measureSprite').click();
   const fidelity=JSON.parse(await viewer.locator('#spriteFidelity').getAttribute('data-result'));
   assert.ok(fidelity.overlap>0);
   profiles[profile]={rectangles:refs[profile].filter(d=>d.kind==='rect').length,fidelity};
  }
  if(scene.parts.length>1){
   for(const part of scene.parts){
    await viewer.selectOption('#liveSubject',part.id);
    assert.equal(await viewer.evaluate(()=>window.mapArt.shownCount),1);
   }
   await viewer.selectOption('#liveSubject','');
   await viewer.locator('#camera').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input'))},initial.camera);
  }
  const hashes=(await read('evidence/'+(source.startsWith('false-moon-rift')?'nod-false-moon':'stygian-arenas')+'-background-compression.json')).scenes[source].tiers;
  const exports={};
  await viewer.locator('#decodedBackground').check();
  for(const tier of [...hashes].reverse()){
   const n=tier.rectangles;
   await viewer.selectOption('#backgroundTier',String(n));
   await viewer.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,n);
   const a=viewer.locator('#sceneryDownload[download="'+stem+'-'+n+'.lua"]');
   await a.waitFor();
   exports[n]=await a.evaluate(async e=>(await(await fetch(e.href)).blob()).size);
   const hash=await viewer.evaluate(async n=>{
    const im=new Image();im.src='assets/'+window.mapArt.decodedBackgroundFile;await im.decode();
    const c=document.createElement('canvas');c.width=512;c.height=288;
    const ctx=c.getContext('2d');const i=n===6144?0:(n-4096)/512;
    ctx.drawImage(im,i%2*512,Math.floor(i/2)*288,512,288,0,0,512,288);
    const rgb=ctx.getImageData(0,0,512,288).data.filter((_,i)=>i%4!==3);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgb)),v=>v.toString(16).padStart(2,'0')).join('');
   },n);
   assert.equal(hash,tier.rgbSha256,id+' '+n);
  }
  pictures.push({name:scene.name,canvases:await viewer.evaluate(()=>['png','rect'].map(id=>document.getElementById(id).toDataURL()))});
  if(!(await viewer.locator('#mapNodePicker').evaluate(el=>el.open)))await viewer.locator('#mapNodePicker summary').click();
  await viewer.selectOption('#nodeArenaFilter','stygian');await viewer.check('#nodeMeasuredFilter');
  assert.deepEqual(await viewer.locator('#nodeSearchResults [data-node]').evaluateAll(els=>els.map(el=>el.dataset.node).sort()),Object.keys(scenes).sort());
  verified[id]={name:scene.name,modes:scene.modes,parts:scene.parts.map(p=>p.name),source,profiles,exports};
  await viewer.close();
 }
 const picker=await browser.newPage();
 const poses=new Set(Object.values(scenes).flatMap(s=>s.parts.map(p=>p.file)).filter(Boolean));
 const requests=[];
 picker.on('request',request=>{
  const file=new URL(request.url()).pathname.split('/').pop();
  if(poses.has(file))requests.push(file);
 });
 await picker.goto(new URL('map-art.html?node=asimon-field-ruins&placements=live',base).href);
 await picker.waitForFunction(()=>window.mapArt?.ready);
 const cached=new Set(requests);
 const visits=async()=>{
  for(const node of Object.keys(scenes)){
   await picker.selectOption('#node',node);
   await picker.waitForFunction(id=>window.mapArt?.node===id&&window.mapArt.ready,node);
  }
 };
 const initial=requests.length;await visits();
 const newPoses=requests.slice(initial);
 assert.deepEqual(newPoses.toSorted(),[...poses].filter(p=>!cached.has(p)).sort());
 const beforeRepeat=requests.length;await visits();
 assert.equal(requests.length,beforeRepeat);
 await picker.close();
 const loading={reusedGalleryFiles:cached.size,firstVisitFiles:newPoses,repeatRequests:requests.length-beforeRepeat};
 assert.deepEqual(errors,[]);
 const image=await page.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=1000;c.height=36+rows.length*218;
  const ctx=c.getContext('2d');ctx.fillStyle='#172a30';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#f6f1dd';ctx.font='bold 17px "Yu Gothic UI",sans-serif';
  ctx.fillText('元の舞台とドット絵',10,24);ctx.fillText('4,096矩形の舞台 ＋ 16色のドット絵',508,24);
  ctx.imageSmoothingEnabled=false;
  for(const [i,row] of rows.entries()){
   const y=36+i*218;ctx.fillText(row.name,10,y+18);
   for(const [j,data] of row.canvases.entries()){
    const im=new Image();im.src=data;await im.decode();ctx.drawImage(im,125,221,710,277,8+j*498,y+23,486,190);
   }
  }
  return c.toDataURL();
 },pictures);
 await fs.writeFile('evidence/stygian-openings-comparison.png',Buffer.from(image.split(',')[1],'base64'));
 await fs.writeFile('evidence/stygian-openings-browser.json',JSON.stringify({differentPixels:0,loading,verified},null,2)+'\n');
 console.log('7 atlas links, 28 difficulty rows, 21 rectangle profiles and 35 background tiers passed.');
}finally{await browser.close()}
