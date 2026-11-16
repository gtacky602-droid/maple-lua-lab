import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const frames=JSON.parse(execFileSync(process.env.PYTHON || 'python',['-c',`import json
from runtime import runtime,native
lua,c=runtime();s=c.new(12);c.action(s,'story_start');c.enterStoryNode(s,'sumeru-field')
frames={}
for mode in ['sprite','rect']:
 f=native(c.frame(s,mode,'h32c16'));f.update(session='dendro-fungus-render-fixture',lua_ms=0,lua_kb=0);frames[mode]=f
print(json.dumps(frames))`],{encoding:'utf8'}));
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.route('**/api/frame',async route=>{const req=route.request().postDataJSON();await route.fulfill({json:frames[req.render==='rect'?'rect':'sprite']})});
 await page.goto('http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame.story?.node==='sumeru-field');
 const draw=await page.evaluate(()=>window.lab.frame.draws.find(d=>d.source==='dendro-fungus-idle-source-v1.png'));
 if(!draw||draw.h!==64||draw.y!==462)throw Error('Dendro Fungus source, scale or grounding');
 await page.locator('#game').screenshot({path:'evidence/dendro-fungus-live-png.png'});
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(()=>!window.lab.frame.draws.some(d=>d.source==='dendro-fungus-idle-source-v1.png'));
 await page.locator('#game').screenshot({path:'evidence/dendro-fungus-live-rect.png'});
 if(errors.length)throw Error(JSON.stringify(errors));
 await fs.writeFile('evidence/dendro-fungus-live-browser.json',JSON.stringify({draw,errors,method:'Actual Lua sumeru-field entry frames rendered through intercepted browser responses. Static render fixture, not live traversal or combat verification.'},null,2));
 console.log('Dendro Fungus actual Lua spawn frames: PNG and low-resolution browser rendering passed');
}finally{await browser.close()}
