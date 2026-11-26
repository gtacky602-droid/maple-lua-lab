import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage();
 await page.goto(process.env.LAB_URL??'http://127.0.0.1:19743/');
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForSelector('#questFilter');
 const groups=page.locator('#questFilter option[value^="hidden:"]');
 assert.equal(await groups.count(),0);
 const save=await readFile('evidence/remaining-survey-save.json','utf8');
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),save);
 await page.locator('#loadProgress').click();
 await page.waitForFunction(()=>document.querySelector('#questFilter option[value="hidden:H03"]'));
 assert.equal(await groups.count(),4);
 const rows=page.locator('#questJournal [data-quest]');
 for(const [i,name] of ['金リンゴ群島','ヴェルーリヤ・ミラージュ','シムランカ'].entries()){
  const value='hidden:H0'+(i+1);
  assert((await page.locator('option[value="'+value+'"]').textContent()).includes(name));
  await page.selectOption('#questFilter',value);
  assert.equal(await rows.count(),2);
  assert.equal(await rows.locator('.expeditionStops').count(),2);
  await rows.first().locator('summary').first().click();
  assert(await rows.first().getByRole('link',{name:'風景を見比べる'}).first().isVisible());
 }
 await page.selectOption('#questFilter','hidden:pending');
 assert.equal(await rows.count(),0);
 assert.match(await page.locator('#chapterProgress').innerText(),/6 \/ 6/);
 console.log('Undiscovered worlds hidden; three discovered series, six quest records and landscape links verified.');
}finally{await browser.close()}
