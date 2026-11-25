import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const browser = await chromium.launch({channel:'chrome', headless:true});
try {
  const page = await browser.newPage();
  await page.goto(new URL('map-art.html', process.env.LAB_URL || 'http://127.0.0.1:9101/').href);
  const report = await page.evaluate(async () => {
    const {sceneryKey, sceneryDefinitions} = await import('./scenery.js');
    const graph = await (await fetch('content/story-graph.json')).json();
    function scan(frame) {
      const zone = frame.campaign?.zone;
      const location = zone === 'town' && frame.story?.active ? 'story:' + frame.story.node : zone;
      for (const [key, definition] of Object.entries(sceneryDefinitions)) {
        if (definition.lightMode && definition.lightMode !== frame.storyLocalLight?.mode) continue;
        if (definition.zones.includes(location) || (frame.storyCleared && definition.clearedZones?.includes(location))) return key;
      }
      if (frame.story?.active && (zone === 'town' || zone?.startsWith('story:'))) {
        if (frame.storyScenery && Object.hasOwn(sceneryDefinitions, frame.storyScenery)) return frame.storyScenery;
        const node = frame.storyGraph?.nodes.find(n => n.id === frame.story.node);
        if (node?.scenery && Object.hasOwn(sceneryDefinitions, node.scenery)) return node.scenery;
        for (const [key, definition] of Object.entries(sceneryDefinitions)) if (definition.region && node?.region === definition.region) return key;
      }
      return 'mondstadt';
    }
    const frames = [];
    for (const {id} of graph.nodes) {
      for (const zone of ['town', 'story:' + id]) {
        for (const mode of ['lit','dark']) {
          for (const cleared of [false,true]) {
            frames.push({campaign:{zone}, story:{active:true,node:id}, storyGraph:graph,
              storyCleared:cleared, storyLocalLight:{mode}});
          }
        }
      }
    }
    const zones = new Set(Object.values(sceneryDefinitions).flatMap(d => d.zones));
    for (const zone of zones) frames.push({campaign:{zone}, story:{active:false,node:'mond-watchtower'}});
    for (const storyScenery of ['chenyuWestBank','missing']) frames.push({campaign:{zone:'town'},
      story:{active:true,node:'unknown'}, storyScenery});
    frames.push({}, {campaign:{zone:'not-a-real-zone'},story:{active:true,node:'mond-watchtower'}});
    for (const f of frames) {
      const expected=scan(f), actual=sceneryKey(f);
      if (expected!==actual) throw Error(JSON.stringify([f.story,expected,actual]));
    }
    // Measure ordinary game calls with each node's authored hint; exclude setup, I/O and drawing.
    const cycle=graph.nodes.map(n=>({campaign:{zone:n.hub?'town':'story:'+n.id},
      story:{active:true,node:n.id},storyScenery:n.scenery,storyGraph:graph}));
    function pass(fn) {
      let checksum=0;
      const begin=performance.now();
      for(const f of cycle) checksum+=fn(f).length;
      return {ms:performance.now()-begin, checksum};
    }
    pass(scan); pass(sceneryKey);
    const before=[], after=[];
    for(let i=0;i<7;i++){
      const oldFirst=i%2===0;
      const first=pass(oldFirst?scan:sceneryKey), second=pass(oldFirst?sceneryKey:scan);
      if(first.checksum!==second.checksum) throw Error('Lookup mismatch during benchmark');
      before.push((oldFirst?first:second).ms); after.push((oldFirst?second:first).ms);
    }
    const median=samples=>samples.toSorted((a,b)=>a-b)[3];
    return {stageCount:graph.nodes.length, cases:frames.length, timingScope:'One scenery selection per stage in Chrome, excluding drawing and file I/O',
      samplesPerMethod:7, previousMedianMs:median(before), indexedMedianMs:median(after)};
  });
  assert.ok(report.cases >= report.stageCount*8);
  await fs.writeFile('evidence/scenery-lookup.json',JSON.stringify(report,null,2)+'\n');
  console.log(report);
} finally { await browser.close(); }
