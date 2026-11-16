import {chromium} from 'playwright';import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const frames=JSON.parse(execFileSync(process.env.PYTHON||'python',['-c',`import json
from runtime import runtime,native
lua,c=runtime();frames={}
for node in ['liyue-entry','inazuma-road','sumeru-entry','fontaine-entry']:
 s=c.new(12);c.action(s,'story_start');c.enterStoryNode(s,node)
 for camera in ([0,480] if node=='liyue-entry' else [0]):
  s.camera=camera
  for mode in ['sprite','rect']:
   f=native(c.frame(s,mode,'h32c16'));f.update(session='regional-placement-fixture',lua_ms=0,lua_kb=0);frames[node+':'+str(camera)+':'+mode]=f
print(json.dumps(frames))`],{encoding:'utf8',maxBuffer:20*1024*1024}));
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[],checked=[];p.on('pageerror',e=>errors.push(e.message));let fixture;
try{
 await p.route('**/api/frame',r=>r.fulfill({json:fixture}));
 for(const [key,f] of Object.entries(frames)){
  console.log('Checking',key);fixture=f;await p.goto('http://127.0.0.1:8769/');await p.waitForFunction(k=>window.lab?.frame.story?.node===k.node&&window.lab.frame.camera===k.camera&&window.lab.frame.draws.length===k.count,{node:f.story.node,camera:f.camera,count:f.draws.length}).catch(async e=>{console.log(JSON.stringify({key,errors,state:await p.evaluate(()=>({node:window.lab?.frame.story?.node,camera:window.lab?.frame.camera,count:window.lab?.frame.draws.length,status:document.getElementById('status')?.textContent}))}));throw e});
  await p.locator('#game').screenshot({path:'evidence/regional-'+key.replaceAll(':','-')+'.png'});
  checked.push({node:f.story.node,camera:f.camera,mode:key.split(':')[2],commands:f.draws.length});
 }
 assert.deepEqual(errors,[]);await fs.writeFile('evidence/regional-placement-browser.json',JSON.stringify({checked,errors,method:'Actual Lua entry frames, camera 0 plus Liyue camera 480; static browser rendering, not continuous traversal or combat verification.'},null,2));console.log('Four regional routes, five views, PNG/lowest rectangles passed');
}finally{await b.close()}
