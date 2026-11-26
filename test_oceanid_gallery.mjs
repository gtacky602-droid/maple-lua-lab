import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(new URL('oceanid-art.html',process.env.LAB_URL||'http://127.0.0.1:8769').href);await page.waitForFunction(()=>window.oceanidGallery?.ready);
 for(const profile of ['legacy','h48c32','h32c16']){await page.selectOption('#profile',profile);await page.waitForFunction(p=>window.oceanidGallery.profile===p,profile);}
 const stats=await page.locator('.stats').allTextContents();
 if(stats.length!==9 || stats.some(text=>!text.includes('形の重なり')||!text.includes('平均色差')||text.includes('NaN')))throw Error(JSON.stringify(stats));
 await page.locator('article').filter({has:page.getByRole('heading',{name:'ツル',exact:true})}).screenshot({path:'evidence/oceanid-crane-16-comparison.png'});
 await page.screenshot({path:'evidence/oceanid-gallery.png',fullPage:true});
 const state=await page.evaluate(()=>window.oceanidGallery);if(errors.length||state.count!==9)throw Error(JSON.stringify({errors,state}));
 await fs.writeFile('evidence/oceanid-gallery.json',JSON.stringify({errors,state},null,2));console.log('9 assets rendered and 3 profiles switched');
}finally{await browser.close()}
