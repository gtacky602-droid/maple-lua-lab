import {chromium} from 'playwright';import fs from 'node:fs/promises';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto('http://127.0.0.1:8769/map-art.html?node=fontaine-field');await p.waitForFunction(()=>window.mapArt?.ready);await p.selectOption('#species','armored-crab');
 const canvas=p.locator('#png'),{width,height}=await canvas.boundingBox();
 await canvas.click({position:{x:560/960*width,y:479/540*height}});
 for(const profile of ['legacy','h48c32','h32c16']){await p.selectOption('#profile',profile);const s=await p.evaluate(()=>window.mapArt);if(s.count!==1||s.placements[0].species!=='armored-crab'||s.placements[0].y!==480||s.visuals[0].y!==480||s.visuals[0].hover!==0||!s.grounded||s.backgroundState!=='ready')throw Error('Placement/profile mismatch')}
 const download=p.waitForEvent('download');await p.click('#export');const exported=await fs.readFile(await (await download).path(),'utf8');await p.click('#reset');await p.locator('#import').setInputFiles({name:'fungus.json',mimeType:'application/json',buffer:Buffer.from(exported)});await p.waitForFunction(()=>window.mapArt.count===1);if((await p.evaluate(()=>window.mapArt)).placements[0].species!=='armored-crab')throw Error('Import identity');
 await p.screenshot({path:'evidence/armored-crab-placement.png',fullPage:true});if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/armored-crab-placement.json',JSON.stringify({profiles:3,exportImport:true,errors,scope:'static visual draft, feet at support; full-body referenced v2 visual draft; no dedicated attack verification'},null,2));console.log('Armored Crab 3 profiles, placement and export/import passed');
}finally{await b.close()}
