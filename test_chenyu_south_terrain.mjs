import {chromium} from 'playwright';
import {testDomainTerrain} from './tools/browser_domain_terrain_test.mjs';

const fields = [
  [64845,'depth',422,'chenyuFernDen',388,'chenyu-depth'],
  [64846,'turn',420,'chenyuSpringGully',400],
  [64847,'scree',416,'chenyuShaleDen',377],
  [64848,'fork',418,'chenyuShieldYard',382],
  [64849,'vault',426,'chenyuJadeNiche',400],
  [64850,'camp',431,'chenyuBannerLedge',408,'chenyu-camp'],
  [66768,'bluff',419,'chenyuBrineStep',400],
  [66769,'wharf',434],
  [66770,'reef',423,'chenyuTideDen',388],
  [66979,'grotto',417,'chenyuEchoVault',400],
].map(([number,name,y,scenery,height,host])=>{
  const stage='branch-hunt-'+number;
  const room=stage+'-pocket-1';
  return {name,stage,host:host??'liyue-wp-'+number,x:690,y,beyond:scenery?room:undefined,
    detours:scenery?[{id:room,scenery}]:[],pocketRoles:scenery?[[room,'optional_elite',height]]:[]};
});
await testDomainTerrain(chromium,{prefix:'chenyu-south',hub:'liyue-harbor',uniqueBackgrounds:true,compareBackgrounds:true},fields);
