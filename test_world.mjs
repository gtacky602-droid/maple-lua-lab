import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#worldDetails summary').click();
 const all=await page.locator('#worldPanel circle').count();if(all!==745)throw Error('missing points');
 await page.getByLabel('地点種別',{exact:true}).selectOption('statue');
 if(await page.locator('#worldPanel circle').count()!==64)throw Error('statue filter');
 await page.getByLabel('地点種別',{exact:true}).selectOption('all');await page.getByLabel('地点IDを検索',{exact:true}).fill('teyvat:3');
 await page.locator('circle[aria-label="teyvat:3"]').click();
 if(!await page.locator('#selectedMapNode').textContent().then(x=>x.includes('373.5')))throw Error('wrong coordinates');
 await page.getByLabel('地点IDを検索',{exact:true}).fill('');
 await page.locator('#worldPanel').getByRole('button',{name:'町（仮配置）',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 await page.locator('#worldPanel').getByRole('button',{name:'城外の狩場（仮配置）',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='field');
 await page.locator('#worldPanel').getByRole('button',{name:'無相の風・2D試作',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.boss?.name.includes('無相'));
 await page.locator('#worldPanel').screenshot({path:'evidence/world-catalog.png'});
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');
 if(errors.length)throw Error(errors.join('\n'));
 await fs.writeFile('evidence/world-browser.json',JSON.stringify({errors,allPoints:all,statues:64,idCoordinatesVerified:true,trialNavigation:true,mobileWidth:true},null,2));
 console.log('World catalog, filters, coordinates, trial navigation, mobile passed');
}finally{await browser.close()}
