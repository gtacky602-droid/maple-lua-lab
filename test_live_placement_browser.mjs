import {chromium} from 'playwright';import fs from 'node:fs/promises';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto(new URL('map-art.html',process.env.LAB_URL||'http://127.0.0.1:8769/').href);await p.waitForFunction(()=>window.mapArt?.ready);
 const initial=await p.evaluate(()=>window.mapArt.placements);
 await p.click('#loadLive');await p.waitForFunction(()=>!document.getElementById('loadLive').disabled);
 let state=await p.evaluate(()=>window.mapArt);if(state.count!==16||state.placements[0].species!=='hilichurl'||!state.placements.some(e=>e.species==='hydro-slime-reference'))throw Error('Live asset mapping');
 await p.click('#undo');if(JSON.stringify(await p.evaluate(()=>window.mapArt.placements))!==JSON.stringify(initial))throw Error('Replacement undo');
 await p.selectOption('#node','liyue-field');await p.click('#loadLive');await p.waitForFunction(()=>!document.getElementById('loadLive').disabled);
 state=await p.evaluate(()=>window.mapArt);if(state.count!==17||state.placements[0].species!=='ruin-guard'||state.placements[0].x!==740||!state.grounded)throw Error('Liyue identity/support');
 await p.selectOption('#node','mond-road');if(JSON.stringify(await p.evaluate(()=>window.mapArt.placements))!==JSON.stringify(initial))throw Error('Other node changed');
 await p.selectOption('#node','liyue-field');const before=JSON.stringify(await p.evaluate(()=>window.mapArt.placements));
 await p.route('**/content/enemy-spawns.json',route=>route.fulfill({status:503,body:'unavailable'}));await p.click('#loadLive');await p.waitForFunction(()=>!document.getElementById('loadLive').disabled);
 if(JSON.stringify(await p.evaluate(()=>window.mapArt.placements))!==before||!(await p.locator('#fileStatus').textContent()).includes('保持'))throw Error('Failed fetch changed edits');await p.unroute('**/content/enemy-spawns.json');
 const download=p.waitForEvent('download');await p.click('#export');const saved=JSON.parse(await fs.readFile(await (await download).path(),'utf8'));if(saved.nodes['liyue-field'].length!==17||saved.nodes['liyue-field'][0].species!=='ruin-guard')throw Error('Export lost live copy');
 await p.click('#loadLive');await p.waitForFunction(()=>!document.getElementById('loadLive').disabled);await p.screenshot({path:'evidence/live-placement-preview.png',fullPage:true});
 await p.setViewportSize({width:390,height:844});if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile overflow');
 await p.selectOption('#node','mond-town');await p.click('#loadLive');await p.waitForFunction(()=>!document.getElementById('loadLive').disabled);if((await p.evaluate(()=>window.mapArt)).count!==0)throw Error('Town populated');
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/live-placement-browser.json',JSON.stringify({checks:['referenced slime aliases','Ruin Guard position and grounding','replacement undo','other node retained','failed fetch retains edits','export','empty hub','390px layout'],errors},null,2));console.log('Live placement load, undo, isolation, error retention, export and mobile checks passed');
}finally{await b.close()}
