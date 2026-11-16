import {chromium} from 'playwright';import {execFileSync} from 'node:child_process';import fs from 'node:fs/promises';
const frames=JSON.parse(execFileSync(process.env.PYTHON||'python',['-c',`import json
from runtime import runtime,native
lua,c=runtime();s=c.new(12);c.action(s,'story_start');c.enterStoryNode(s,'mond-road')
for a in s.actors.values():a.hp=0
fresh=c.new(12);s.enemies=lua.table()
for i,name in enumerate(['hydro-slime','pyro-slime','hilichurl','ruin-guard','dendro-fungus','nobushi','armored-crab'],1):
 e=fresh.enemies[i];e.art=name;e.x=70+(i-1)*135;e.y=480;e.hp=e.maxhp/2;e.warning=.5;s.enemies[i]=e
out={}
for mode in ['sprite','rect']:
 f=native(c.frame(s,mode,'h32c16'));f.update(session='enemy-overlay-fixture',lua_ms=0,lua_kb=0);out[mode]=f
print(json.dumps(out))`],{encoding:'utf8'}));
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{await p.route('**/api/frame',async route=>{const req=route.request().postDataJSON();await route.fulfill({json:frames[req.render==='rect'?'rect':'sprite']})});await p.goto('http://127.0.0.1:8769/');await p.waitForFunction(()=>window.lab?.frame.total===7);
 for(const mode of ['sprite','rect']){await p.selectOption('#renderMode',mode);await p.waitForFunction(m=>window.lab.frame.draws.some(d=>d.kind==='boss_sprite')===(m==='sprite'),mode);const ui=await p.evaluate(()=>({warnings:window.lab.frame.draws.filter(d=>d.kind==='text'&&d.text==='!').length,bars:window.lab.frame.draws.filter(d=>d.kind==='rect'&&d.color==='#ffcc7c').length}));if(ui.warnings!==7||ui.bars!==7)throw Error('Overlay count');await p.locator('#game').screenshot({path:`evidence/enemy-overlays-${mode}.png`})}
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/enemy-overlays-browser.json',JSON.stringify({errors,assets:7,modes:2,method:'Static real Lua fixture with half HP and active warnings; no combat progression claimed'},null,2));console.log('Seven enemy HP bars/warnings in PNG and rectangle browser fixtures passed');
}finally{await b.close()}
