import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';

const base=process.env.LAB_URL??'http://127.0.0.1:19563/';
const records=JSON.parse(await readFile('content/enemy-spawns.json','utf8')).nodes['ina-sayu-watchpath'];
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 const results=[];
 for(const enemy of records){
  const url=new URL('map-art.html',base);
  url.search=new URLSearchParams({placements:'live',node:'ina-sayu-watchpath',subject:enemy.id,profile:'h32c16'});
  await page.goto(url.href);
  await page.waitForFunction(()=>window.mapArt?.ready);
  await page.locator('#compareSpriteProfiles').click();
  const row=await page.locator('#spriteProfileTable tbody tr').last().innerText();
  const [,count,shape,color]=row.split('\t');
  assert.equal(Number(count),435);
  assert(parseFloat(shape)>=99 && parseFloat(color)<25,enemy.id);
  results.push({id:enemy.id,camera:await page.locator('#camera').inputValue(),shape:parseFloat(shape),color:parseFloat(color)});
 }
 console.log(results);
 await writeFile('evidence/nobushi-field-focus.json',JSON.stringify(results,null,2)+'\n');
}finally{await browser.close()}

