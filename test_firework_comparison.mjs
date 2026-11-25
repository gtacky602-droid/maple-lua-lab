import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1100,height:660}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('firework-preview.html',process.env.LAB_URL).href);
 const result=page.locator('#result');
 await page.waitForSelector('#result[data-sample]');
 const proof=[];
 for(const color of ['sea','sunset','wisteria']){
  await page.selectOption('#color',color);
  for(const shape of ['ring','chrysanthemum','fan']){
   await page.selectOption('#shape',shape);
   for(const [beat,tier] of [[0,0],[20,4096],[40,4608],[60,5120],[80,5632],[100,6144]]){
    await page.selectOption('#tier',String(tier));
    await page.locator('#beat').fill(String(beat));
    const sample=[color,shape,beat,tier].join('/');
    await page.waitForFunction(sample=>document.querySelector('#result').dataset.sample===sample,sample);
    assert.equal(await result.getAttribute('data-difference'),'0',sample);
    proof.push({color,shape,beat,tier,measurement:await result.textContent()});
    if(color==='sunset'&&shape==='fan'&&beat===40)await page.locator('main').screenshot({path:'evidence/firework-packing-comparison.png'});
   }
  }
 }
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/firework-packing-pixels.json',JSON.stringify(proof,null,2)+'\n');
 console.log(proof.length+' samples passed',proof[34].measurement);
}finally{await browser.close()}
