import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const idle='amber-idle-source-v3.png',bow='amber-bow-source-v3.png';
const hasArt=file=>page.waitForFunction(source=>window.lab.frame.draws.some(d=>d.source===source),file);
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('[data-action="campaign"]').click();
 await page.waitForFunction(()=>window.lab.frame.campaign?.zone==='town');
 await page.locator('[data-action="companion:amber"]').click();await hasArt(idle);
 await page.locator('#game').screenshot({path:'evidence/amber-art-browser.png'});
 await page.locator('[data-action="swap"]').click();await page.waitForFunction(()=>window.lab.frame.active===2);
 await page.locator('[data-action="skill1"]').click();await hasArt(bow);
 await page.evaluate(()=>window.lab.action('pause'));await page.waitForFunction(()=>window.lab.frame.paused);
 const pose=await page.evaluate(source=>window.lab.frame.draws.find(d=>d.source===source),bow);
 assert.deepEqual([pose.h,pose.y],[88,480]);
 await page.locator('#game').screenshot({path:'evidence/amber-bow-browser.png'});
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(source=>!window.lab.frame.draws.some(d=>d.source===source),bow);
 await page.selectOption('#renderMode','sprite');await hasArt(bow);
 await page.evaluate(()=>window.lab.action('pause'));await hasArt(idle);
 assert.deepEqual(errors,[]);
 await fs.writeFile('evidence/amber-art-browser.json',JSON.stringify({errors,method:'Town UI companion selection and existing fire-arrow action; art switches at the preexisting lock',pose,rectMode:true,idleRestored:true},null,2));
 console.log('Amber browser idle, bow pose in both render modes and return to idle passed');
}finally{await browser.close()}
