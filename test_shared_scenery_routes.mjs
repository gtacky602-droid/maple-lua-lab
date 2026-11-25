import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const read=async path=>JSON.parse(await fs.readFile(path,'utf8'));
const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const tiers=[4096,4608,5120,5632,6144];
const sources=[],stages={},seen=new Set();
for(const path of (await fs.readdir('evidence')).filter(n=>n.endsWith('-background-compression.json'))){
  const prefix=path.replace('-background-compression.json','');
  const bundle=(prefix==='beryl'?'fon-beryl':prefix);
  const encoded=(await read('evidence/'+path)).scenes;
  const {scenes}=await read('assets/'+bundle+'-background-generation.json');
  for(const row of scenes){
    if(row.phase)continue;
    const ids=[row.node,...row.sharedNodes??[]];
    assert.ok(!seen.has(row.source));seen.add(row.source);
    const tiles=encoded[row.source].tiers;
    for(const id of ids){
      assert.equal(stages[id],undefined);
      stages[id]={source:row.source,primary:row.node,bundle:bundle+'-native-backgrounds.lua',uses:ids.length};
    }
    if(prefix.startsWith('shared-scenes-'))sources.push({source:row.source,preview:row.preview,tiles});
  }
}
const graph=await read('content/story-graph.json');
assert.equal(Object.keys(stages).length,graph.nodes.length);
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
  const page=await browser.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'map-art.html?placements=live&node=mond-town&tier=4096&compare=background');
  await page.waitForFunction(()=>window.mapArt?.ready && window.mapArt.decodedBackgroundRectangles===4096);
  const counts=await page.evaluate(async({graph,stages,sources,tiers})=>{
    const {sceneryKey,sceneryDefinitions}=await import('./scenery.js');
    const {backgroundMeasurements}=await import('./scenery-measurements.js');
    let phases=0,tileChecks=0;
    function must(value,context){if(!value)throw Error(context)}
    for(const n of graph.nodes){
      const frame={story:{active:true,node:n.id},campaign:{zone:n.hub?'town':'story:'+n.id},storyGraph:graph};
      const d=sceneryDefinitions[sceneryKey(frame)],expected=stages[n.id],measure=backgroundMeasurements[n.id];
      must(expected && d.file===expected.source && d.decodedPreview && d.decodedTiers,n.id+' scenery');
      must(measure===backgroundMeasurements[expected.primary] && measure.bundle===expected.bundle,n.id+' module');
      must((measure.locations??1)===expected.uses && tiers.every(t=>Number.isFinite(measure.error[t])),n.id+' levels');
      if(n.locationAfterReport?.scenery){
        frame.storyScenery=n.locationAfterReport.scenery;
        const phase=sceneryDefinitions[sceneryKey(frame)];
        must(stages[phase.measurementNode]?.source===phase.file && phase.decodedTiers && phase.decodedPreview,n.id+' after report');
        phases++;
      }
    }
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=288;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    async function load(file){const img=new Image();img.src='assets/'+file;await img.decode();return img}
    for(const {source,preview,tiles} of sources){
      const [high,atlas]=await Promise.all([load(preview),load(preview.replace('-preview-v1.png','-tiers-v1.webp'))]);
      for(const {rectangles,rgbSha256} of tiles){
        const i=rectangles===6144?0:(rectangles-4096)/512;
        ctx.drawImage(rectangles===6144?high:atlas,i%2*512,Math.floor(i/2)*288,512,288,0,0,512,288);
        const rgba=ctx.getImageData(0,0,512,288).data,raw=new Uint8Array(512*288*3);
        for(let s=0,d=0;s<rgba.length;s+=4){raw[d++]=rgba[s];raw[d++]=rgba[s+1];raw[d++]=rgba[s+2]}
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),v=>v.toString(16).padStart(2,'0')).join('');
        must(hash===rgbSha256,source+' '+rectangles);tileChecks++;
      }
    }
    return {routes:graph.nodes.length,afterReport:phases,newTileChecks:tileChecks};
  },{graph,stages,sources,tiers});
  const examples=[];
  for(const node of ['mond-town','liyue-harbor','natlan-hub','fontaine-hub']){
    const {source,uses}=stages[node];
    await page.goto(base+'map-art.html?'+new URLSearchParams({node,placements:'live',compare:'background',tier:'4096'}));
    await page.waitForFunction(s=>window.mapArt?.backgroundFile===s&&window.mapArt.decodedBackgroundRectangles===4096,source);
    if(uses>1)assert.ok((await page.locator('#context').innerText()).includes(uses+'地点で共用'));
    for(const tier of [4096,6144]){
      await page.selectOption('#backgroundTier',String(tier));
      const link=page.locator('#sceneryDownload[download$="-'+tier+'.lua"]');await link.waitFor();
      const meta=await link.evaluate(async a=>({name:a.download,bytes:(await(await fetch(a.href)).blob()).size}));
      assert.ok(meta.bytes>0);
      examples.push({node,tier,...meta});
    }
  }
  assert.deepEqual(errors,[]);
  const summary={...counts,distinctPaintings:seen.size,newlyCompressedPaintings:sources.length,examples};
  await fs.writeFile('evidence/shared-scenery-browser.json',JSON.stringify(summary,null,2)+'\n');
  console.log(summary);
}finally{await browser.close();}
