import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const assets=(await fs.readdir('assets')).filter(name=>name.startsWith('field-arenas-')&&name.endsWith('-background-generation.json'));
const scenes=[];
for(const file of assets){
 const manifest=await read('assets/'+file);
 const report=await read('evidence/'+file.replace('-generation','-compression'));
 for(const row of manifest.scenes)scenes.push({...row,tiers:report.scenes[row.source].tiers});
}
const field=(await read('content/field-boss-spawns.json')).fieldBosses;
const weekly=(await read('content/weekly-boss-spawns.json')).weeklyBosses;
const exported=(await read('evidence/scenery-download-tiers.json')).fileBytesByRectangles;
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
 const entry='ruin-serpent-field-pit';
 await page.goto(base);
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab?.frame.story.active);
 await page.keyboard.press('KeyM');
 await page.locator('#atlasWorld').click();
 await page.locator('#atlasLayer').selectOption('boss');
 await page.locator('#atlasField').selectOption(entry);
 const atlasLink=page.locator('#atlasBackgroundCompare[href*="'+entry+'"]');
 const [preview]=await Promise.all([page.waitForEvent('popup'),atlasLink.click()]);
 await preview.waitForFunction(id=>window.mapArt?.node===id&&window.mapArt.backgroundState==='ready',entry);
 await preview.close();
 await page.goto(base+'map-art.html?arena=field&measured=1&placements=live&tier=4096&compare=background&node='+scenes[0].node);
 await page.waitForFunction(()=>window.mapArt?.ready);
 const listed=()=>page.locator('#nodeSearchResults button[data-node]').evaluateAll(all=>all.map(b=>b.dataset.node).sort());
 const expected=await page.evaluate(async roster=>{
  const measured=(await import('./scenery-measurements.js')).backgroundMeasurements;
  return [...new Set(roster.flatMap(b=>[b.node,b.innerNode]).filter(n=>measured[n]))].sort();
 },field);
 assert.deepEqual(await listed(),expected);
 assert.ok(scenes.every(s=>expected.includes(s.node)));
 assert.equal(await page.locator('#mapNodePicker').evaluate(el=>el.open),true);
 await page.selectOption('#nodeArenaFilter','weekly');
 assert.deepEqual(await listed(),[...new Set(weekly.flatMap(b=>[b.node,b.innerNode]).filter(Boolean))].sort());
 const sample=weekly.find(b=>b.innerNode);
 await page.locator('#nodeSearch').fill(sample.name);
 assert.ok((await listed()).includes(sample.innerNode));
 await page.locator('#clearNodeSearch').click();
 assert.equal(await page.locator('#nodeArenaFilter').inputValue(),'');
 await page.selectOption('#nodeArenaFilter','field');await page.check('#nodeMeasuredFilter');
 const results={};
 for(const s of scenes){
  await page.locator('#nodeSearchResults [data-node="'+s.node+'"]').click();
  await page.waitForFunction(id=>window.mapArt?.node===id && window.mapArt.backgroundState==='ready',s.node);
  assert.equal(await page.evaluate(()=>window.mapArt.backgroundFile),s.source);
  const tiers={};
  for(const {rectangles:n,rgbSha256} of s.tiers){
   await page.selectOption('#backgroundTier',String(n));
   await page.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,n);
   const filename=s.source.replace('-background-v1.png','-'+n+'.lua');
   const link=page.locator('#sceneryDownload[download="'+filename+'"]');await link.waitFor();
   const file=await link.getAttribute('download');
   assert.equal(file,s.source.replace('-background-v1.png','-'+n+'.lua'));
   const hash=await page.evaluate(async n=>{
    const img=new Image();img.src='assets/'+window.mapArt.decodedBackgroundFile;await img.decode();
    const c=document.createElement('canvas');c.width=512;c.height=288;
    const ctx=c.getContext('2d');const tile=n===6144?0:(n-4096)/512;
    ctx.drawImage(img,512*(tile%2),288*Math.floor(tile/2),512,288,0,0,512,288);
    const bytes=ctx.getImageData(0,0,512,288).data.filter((_,i)=>i%4!==3);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   },n);
   assert.equal(hash,rgbSha256,s.node+' / '+n);
   const bytes=await link.evaluate(async a=>(await (await fetch(a.href)).blob()).size);
   assert.equal(bytes,exported[s.source][n]);
   tiers[n]={bytes,pixelHash:hash};
  }
  results[s.node]={source:s.source,tiers};
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/field-arena-backgrounds-browser.json',JSON.stringify({fieldPickerCount:expected.length,
  atlasEntry:entry,sceneCount:scenes.length,verifiedTiers:scenes.reduce((n,s)=>n+s.tiers.length,0),scenes:results},null,2)+'\n');
 console.log(scenes.length+' field arenas: every tier, export filename, pixel hash and filtered map selection passed.');
}finally{await browser.close()}
