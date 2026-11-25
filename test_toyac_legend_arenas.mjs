import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {displayedTierHash} from './tools/browser_scenery_tier.mjs';

const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const base=process.env.LAB_URL||'http://127.0.0.1:9117/';
const {scenes}=await read('assets/natlan-toyac-legends-background-generation.json');
const encoded=(await read('evidence/natlan-toyac-legends-background-compression.json')).scenes;
const props=await read('content/toyac-quest-previews.json');
const players=await read('content/group-legend-openings.json');
const graph=await read('content/story-graph.json');
const names=new Map(graph.nodes.map(n=>[n.id,n.name]));
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:920}});
 const results=[],pictures=[],phases={},errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const open=async node=>{
  await page.goto(base+'map-art.html?'+new URLSearchParams({node,placements:'live',compare:'background',tier:'4096'}));
  await page.waitForFunction(id=>window.mapArt?.node===id&&window.mapArt.decodedBackgroundRectangles===4096,node);
 };
 for(const {node,source} of scenes){
  await open(node);
  assert.equal(await page.evaluate(()=>window.mapArt.backgroundFile),source);
  const image=id=>page.locator('#'+id).evaluate(c=>c.toDataURL());
  const row={name:names.get(node),images:[await image('png'),await image('rect')]};
  const records=[];
  for(const tier of encoded[source].tiers){
   const n=tier.rectangles;
   await page.selectOption('#backgroundTier',String(n));
   await page.waitForFunction(n=>window.mapArt.decodedBackgroundRectangles===n,n);
   const link=page.locator('#sceneryDownload[download$="-'+n+'.lua"]');
   await link.waitFor();
   assert.equal(await displayedTierHash(page,n),tier.rgbSha256);
   records.push({rectangles:n,bytes:await link.evaluate(async a=>(await(await fetch(a.href)).blob()).size)});
  }
  row.images.push(await image('rect'));pictures.push(row);
  const visuals=await page.evaluate(()=>window.mapArt.visuals);
  if(players[node])assert.deepEqual(visuals.map(v=>v.height),players[node].parts.map(p=>p.h));
  const gate=page.locator('#legendAccess');
  const entrance=Object.keys(props).find(id=>graph.nodes.find(n=>n.id===id).exits.some(e=>e.to===node));
  if(entrance){
   await gate.locator('summary').click();
   assert.match(await gate.innerText(),/を進めます/);
   await gate.locator('a').click();
   await page.waitForFunction(n=>window.mapArt?.node===n&&window.mapArt.decodedBackgroundRectangles===6144,entrance);
   await page.locator('#questArenaLink').click();
   await page.waitForFunction(n=>window.mapArt?.node===n&&window.mapArt.decodedBackgroundRectangles===6144,node);
  }
  results.push({node,source,records,visuals});
 }
 for(const [node,preview] of Object.entries(props)){
  await open(node);
  const targets=graph.nodes.find(n=>n.id===node).breakTargets;
  if(targets){
   assert.equal(preview.stages.length,2**targets.length);
   for(const stage of preview.stages){
    for(const target of targets){
     const id=String(target.entity);
     await page.locator('#crystalPreview input[value="'+id+'"]').setChecked(!stage.visible.includes(id));
    }
    assert.equal(await page.locator('#questPropStage').inputValue(),String(preview.stages.indexOf(stage)));
    assert.equal(await page.locator('#crystalPreview output').textContent(),'残り '+stage.visible.length+' / '+targets.length);
   }
  }else{
   assert.equal(preview.stages.length,4);
   await page.selectOption('#questPropStage','1');
   assert.equal(await page.locator('#camera').inputValue(),String(preview.stages[1].focusX-480));
  }
  const bounds=Number(await page.locator('#camera').getAttribute('max'));
  phases[node]=[];
  for(const camera of [0,bounds]){
   // Compare both canvases with the final (empty) stage at the same camera.
   const checked=await page.evaluate(({camera,preview})=>{
    const choose=(index)=>{
     const stage=document.getElementById('questPropStage');
     stage.value=String(index);stage.dispatchEvent(new Event('change'));
     const cameraInput=document.getElementById('camera');
     cameraInput.value=String(camera);cameraInput.dispatchEvent(new Event('input'));
    };
    const read=(id)=>document.getElementById(id).getContext('2d').getImageData(0,0,960,540);
    choose(preview.stages.length-1);
    const backgrounds={png:read('png'),rect:read('rect')},results=[];
    for(const [index,stage] of preview.stages.entries()){
     choose(index);
     for(const id of ['png','rect']){
      const c=document.createElement('canvas');c.width=960;c.height=540;
      const ctx=c.getContext('2d');ctx.putImageData(backgrounds[id],0,0);
      for(const prop of stage.visible){
       for(const mark of preview.props[prop]){
        const x=mark.x-camera,y=mark.y;
        ctx.fillStyle=mark.color;
        if(mark.kind==='rect')ctx.fillRect(x,y,mark.w,mark.h);
        else{
         ctx.font='bold '+mark.size+'px "Yu Gothic UI",sans-serif';ctx.textAlign='center';
         ctx.lineWidth=3;ctx.strokeStyle='#2a484868';ctx.strokeText(mark.text,x,y);ctx.fillText(mark.text,x,y);
        }
       }
      }
      const expected=ctx.getImageData(0,0,960,540).data,actual=read(id).data;
      let differing=0,changed=0;
      for(let i=0;i<actual.length;i+=4){
       if(actual[i]!==expected[i]||actual[i+1]!==expected[i+1]||actual[i+2]!==expected[i+2])differing++;
       const old=backgrounds[id].data;
       if(actual[i]!==old[i]||actual[i+1]!==old[i+1]||actual[i+2]!==old[i+2])changed++;
      }
      results.push({index,id,differing,changed});
     }
    }
    return results;
   },{camera,preview});
   assert.ok(checked.every(r=>r.differing===0),JSON.stringify({node,camera,checked}));
   phases[node].push({camera,checked});
  }
  for(let i=0;i<preview.stages.length-1;i++){
   assert.ok(phases[node].some(p=>p.checked.some(c=>c.index===i&&c.changed>0)));
  }
 }
 const sheet=await page.evaluate(async rows=>{
  const c=document.createElement('canvas');c.width=1350;c.height=38+rows.length*286;
  const ctx=c.getContext('2d');ctx.fillStyle='#192d30';ctx.fillRect(0,0,c.width,c.height);
  ctx.font='bold 18px "Yu Gothic UI",sans-serif';ctx.fillStyle='#f6f1df';
  ['元の背景','4,096矩形','6,144矩形'].forEach((s,i)=>ctx.fillText(s,8+i*450,25));
  for(const [i,row] of rows.entries()){
   const y=38+i*286;ctx.fillText(row.name,8,y+19);
   for(const [j,uri] of row.images.entries()){
    const im=new Image();im.src=uri;await im.decode();
    ctx.drawImage(im,j*450+5,y+24,440,248);
   }
  }
  return c.toDataURL();
 },pictures);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/toyac-legend-comparison.png',Buffer.from(sheet.split(',')[1],'base64'));
 await fs.writeFile('evidence/toyac-legend-arenas-browser.json',JSON.stringify({results,phases},null,2)+'\n');
 console.log('Four backgrounds at five tiers, both quest passages and twelve Lua prop states verified.');
}finally{await browser.close()}
