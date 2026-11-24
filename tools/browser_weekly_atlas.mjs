import assert from 'node:assert/strict';

export async function checkWeeklyAtlas(page, target, stops, label, screenshot) {
 const map = page.locator('#worldAtlas');
 await page.evaluate(()=>document.activeElement?.blur());
 await page.keyboard.press('KeyM');
 await map.waitFor();
 await map.locator('#atlasField').selectOption(target);
 await page.waitForFunction(target=>window.lab.frame.worldMap?.selected?.id===target,target);
 const {guide, time, scene}=await page.evaluate(()=>{
  const f=window.lab.frame;
  return {guide:f.worldMap.guide,time:f.t,scene:f.story.node};
 });
 assert.equal(guide.status,'battle');
 assert.deepEqual(guide.stops.map(stop=>stop.id),stops);
 assert.equal(guide.stops.at(-1).label,label);
 assert.equal(guide.stops.at(-1).mode,'battle');
 await map.locator('#atlasItineraryStops button').filter({hasText:label}).waitFor();
 await map.getByText(guide.stops.at(-1).hint,{exact:false}).waitFor();
 if(screenshot)await map.screenshot({path:screenshot});
 assert.deepEqual(await page.evaluate(()=>[window.lab.frame.t,window.lab.frame.story.node]),[time,scene]);
 await page.keyboard.press('Escape');
 await map.waitFor({state:'hidden'});
 return guide.stops;
}
