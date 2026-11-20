import {chromium} from 'playwright';import fs from 'node:fs/promises';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8769')+'/map-art.html');await p.waitForFunction(()=>window.mapArt?.ready);
 const ids=await p.locator('#node option').evaluateAll(xs=>xs.map(x=>x.value)),results=[];
 for(const id of ids){await p.selectOption('#node',id);await p.waitForFunction(id=>window.mapArt.node===id&&window.mapArt.backgroundState!=='loading',id);const s=await p.evaluate(()=>window.mapArt);if(!s.grounded||s.backgroundState!=='ready')throw Error('Invalid node '+id);results.push({id,count:s.count,fallback:s.backgroundFallback,backgroundState:s.backgroundState});}
 await p.selectOption('#node','mond-road');for(const profile of ['legacy','h48c32','h32c16']){await p.selectOption('#profile',profile);await p.locator('#camera').fill('480');await p.locator('#camera').dispatchEvent('input');if((await p.evaluate(()=>window.mapArt)).camera!==480)throw Error('camera');}
 await p.locator('#camera').fill('0');await p.locator('#camera').dispatchEvent('input');
 const canvas=p.locator('#png');
 const clickMapAt=async(x,y)=>{const {width,height}=await canvas.boundingBox();await canvas.click({position:{x:x/960*width,y:y/540*height}})};
 await clickMapAt(600,470);let s=await p.evaluate(()=>window.mapArt);if(s.count!==4||s.placements[3].y!==480)throw Error('snap');
 await p.selectOption('#node','mond-town');if((await p.evaluate(()=>window.mapArt)).count!==0)throw Error('hub populated');await p.selectOption('#node','mond-road');if((await p.evaluate(()=>window.mapArt)).count!==4)throw Error('lost edit');
 const downloadPromise=p.waitForEvent('download');await p.click('#export');const download=await downloadPromise;const exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));if(exported.nodes['mond-road'].length!==4)throw Error('export lost draft');
 await p.click('#undo');if((await p.evaluate(()=>window.mapArt)).count!==3)throw Error('undo');await p.click('#reset');
 const upload=async(name,text)=>{await p.locator('#import').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(text)});await p.waitForFunction(()=>document.getElementById('import').value==='')};
 await upload('saved.json',JSON.stringify(exported));if((await p.evaluate(()=>window.mapArt)).count!==4)throw Error('import lost edit');
 await clickMapAt(650,470);s=await p.evaluate(()=>window.mapArt);if(s.count!==5||new Set(s.placements.map(e=>e.id)).size!==5)throw Error('imported ID collision');await p.click('#undo');if((await p.evaluate(()=>window.mapArt)).count!==4)throw Error('undo removed imported item');
 const before=JSON.stringify(await p.evaluate(()=>window.mapArt.placements));
 for(const [name,text] of [['broken.json','{'],['invalid.json',JSON.stringify({...exported,version:99})],['large.json',' '.repeat(512*1024+1)]]){await upload(name,text);if(JSON.stringify(await p.evaluate(()=>window.mapArt.placements))!==before||!(await p.locator('#fileStatus').textContent()).includes('保持'))throw Error('failed import changed draft');}
 await p.click('#reset');
 await p.screenshot({path:'evidence/map-art.png',fullPage:true});await p.setViewportSize({width:390,height:844});if(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile('evidence/map-art-test.json',JSON.stringify({errors,nodes:results,profiles:3,camera:true,platformSnap:true,nodeRetention:true,download:true,importRoundtrip:true,importFailurePreservesDraft:true,importIdCollisionAvoided:true,undo:true,reset:true,mobileOverflow:false},null,2));console.log(`${ids.length} map previews, edit/export/undo and mobile layout passed`);
}finally{await b.close()}
