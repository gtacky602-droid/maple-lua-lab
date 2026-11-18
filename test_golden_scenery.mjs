import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1100,height:700}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769/');
  const result=await page.evaluate(async()=>{
    const {scenery,sceneryStatus,backgroundReady}=await import('./scenery.js');
    await backgroundReady;
    const graph=await(await fetch('content/story-graph.json')).json();
    const nodes=graph.nodes.filter(n=>n.hiddenGroup==='golden');
    const mappings=nodes.map(n=>({
      id:n.id,...sceneryStatus({
        campaign:{zone:n.hub?'town':'story:'+n.id},story:{active:true,node:n.id},storyGraph:graph
      })
    }));
    const dock=nodes.find(n=>n.id==='golden-mainland-coast'),canvas=document.createElement('canvas');
    canvas.id='sceneryPreview';canvas.width=960;canvas.height=540;
    canvas.style='position:fixed;inset:20px;z-index:999;background:black';document.body.append(canvas);
    scenery(canvas.getContext('2d'),{campaign:{zone:'town'},story:{active:true,node:dock.id},storyGraph:graph,
      platforms:dock.platforms,camera:0});
    return mappings;
  });
  assert.deepEqual(Object.fromEntries(result.map(({id,key})=>[id,key])),{
    'golden-hub':'golden','golden-play':'golden','golden-mainland-coast':'goldenDock',
    'golden-shadow-lookouts':'golden','golden-shadow-grotto':'goldenGrotto','golden-tide-pocket':'goldenGrotto'
  });
  assert.ok(result.every(row=>row.state==='ready'));
  assert.deepEqual(errors,[]);
  await page.locator('#sceneryPreview').screenshot({path:'evidence/golden-scenery.png'});
  await fs.writeFile('evidence/golden-scenery.json',JSON.stringify({errors,result,
    method:'Story-node placements rendered by the shared host scenery'},null,2));
  console.log('Six Golden island nodes and host preview passed');
}finally{await browser.close()}
