import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/bosses-art.html');
 const result=await p.evaluate(async()=>{
  const {scenery,sceneryDefinitions,sceneryStatus,backgroundReady}=await import('./scenery.js');await backgroundReady;
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const results=[];
  for(const [key,definition] of Object.entries(sceneryDefinitions))for(const camera of [-960,0,480,1920,3840,99999]){
   ctx.clearRect(0,0,960,540);
   const frame={camera,platforms:[],campaign:{zone:definition.region?'story:extent':definition.zones[0]},story:{active:true,node:'extent'},storyGraph:{nodes:[{id:'extent',region:definition.region,width:4800}]}};
   const status=sceneryStatus(frame);if(status.key!==key||status.state!=='ready')throw Error('Background not loaded: '+key);
   scenery(ctx,frame);
   const data=ctx.getImageData(0,0,960,540).data;let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<255)transparent++;
   results.push({key,camera,transparent});
  }
  return results;
 });
 assert.deepEqual(errors,[]);
 assert.deepEqual(result.filter(r=>r.transparent),[],'Background must cover the viewport at every camera position');
 await fs.writeFile('evidence/scenery-extent-test.json',JSON.stringify({errors,cases:result,note:'All pixels alpha255 for all actual host images at six camera positions; no platform fill masks background gaps. This is lab background coverage, not native 3D.'},null,2));
 console.log(`${result.length} background/camera combinations cover all pixels`);
}finally{await b.close()}
