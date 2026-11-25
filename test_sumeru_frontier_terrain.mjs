import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

const {nodes} = JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const stages = new Map(nodes.map(node=>[node.id,node]));
for (const prefix of ['sum-frontier','tun-domains']) {
  const {scenes} = JSON.parse(await fs.readFile('assets/'+prefix+'-background-generation.json','utf8'));
  const fields = scenes.filter(scene=>!stages.get(scene.node).atlasParent).map(scene=>{
    const stage = stages.get(scene.node);
    const [home, detour] = stage.exits;
    const left = home.x < 1000;
    return {name:scene.key, stage:stage.id, host:home.to, x:left ? 650 : 2300,
      y:stage.platforms[left ? 1 : 4].y, beyond:detour?.to,
      pocketScenery:detour && stages.get(detour.to).scenery};
  });
  await testDomainTerrain(chromium,{prefix,hub:'sumeru-hub',uniqueBackgrounds:true,compareBackgrounds:true},fields);
}
