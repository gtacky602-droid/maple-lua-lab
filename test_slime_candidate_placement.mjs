import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1100}});
try{
 await p.goto('http://127.0.0.1:8769/map-art.html');await p.waitForFunction(()=>window.mapArt?.ready);
 await p.selectOption('#node','liyue-field');
 for(const [species,x] of [['hydro-slime-reference',480],['pyro-slime-reference',650]]){
  await p.selectOption('#species',species);const box=await p.locator('#png').boundingBox();await p.mouse.click(box.x+x/960*box.width,box.y+478/540*box.height);
 }
 for(const profile of ['legacy','h48c32','h32c16']){await p.selectOption('#profile',profile);const s=await p.evaluate(()=>window.mapArt);if(s.count!==2||!s.grounded)throw Error('Candidate placement');}
 const pending=p.waitForEvent('download');await p.click('#export');const downloaded=await pending,path=await downloaded.path();
 await p.click('#reset');await p.setInputFiles('#import',path);await p.waitForFunction(()=>window.mapArt.count===2);
 const state=await p.evaluate(()=>window.mapArt);if(!state.placements.every(e=>e.species.endsWith('-reference')))throw Error('Candidate identity lost');
 await p.screenshot({path:'evidence/slime-candidate-placement.png',fullPage:true});
 await fs.writeFile('evidence/slime-candidate-placement.json',JSON.stringify({state,exportImport:true,profiles:3,scope:'visual draft only; no live combat changes'},null,2));console.log('Both slime candidates: grounded placement, profiles and export/import passed');
}finally{await b.close()}
