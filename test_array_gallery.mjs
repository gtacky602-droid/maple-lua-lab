import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769/array-art.html');await page.waitForFunction(()=>window.arrayGallery?.ready);
 for(const profile of ['legacy','h48c32','h32c16']){await page.selectOption('#profile',profile);await page.waitForFunction(p=>window.arrayGallery.profile===p,profile);}
 await page.screenshot({path:'evidence/array-gallery.png',fullPage:true});
 const state=await page.evaluate(()=>window.arrayGallery);if(errors.length||state.count!==5)throw Error(JSON.stringify({errors,state}));
 await fs.writeFile('evidence/array-gallery.json',JSON.stringify({errors,state},null,2));console.log('5 assets rendered and 3 profiles switched');
}finally{await browser.close()}
