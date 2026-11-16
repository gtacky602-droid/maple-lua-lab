import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769/oceanid-art.html');await page.waitForFunction(()=>window.oceanidGallery?.ready);
 for(const profile of ['legacy','h48c32','h32c16']){await page.selectOption('#profile',profile);await page.waitForFunction(p=>window.oceanidGallery.profile===p,profile);}
 await page.screenshot({path:'evidence/oceanid-gallery.png',fullPage:true});
 const state=await page.evaluate(()=>window.oceanidGallery);if(errors.length||state.count!==9)throw Error(JSON.stringify({errors,state}));
 await fs.writeFile('evidence/oceanid-gallery.json',JSON.stringify({errors,state},null,2));console.log('9 assets rendered and 3 profiles switched');
}finally{await browser.close()}
