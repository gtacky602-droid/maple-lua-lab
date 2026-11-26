import {checkTerrainScenes} from './tools/check_terrain_scenes.mjs';

const groups={
 sumeruDesertTombApproach:['sum-wp-36674','sum-wp-36675','sum-wp-36677','sum-wp-36689','sum-wp-36690','sum-wp-36691','sum-wp-36696','sum-wp-36699','sum-wp-41819','sum-wp-41821','sum-wp-41822','sum-wp-41840'],
 sumSandMarket:['sum-wp-36680','sum-wp-36684'],
 sumSandEastBasin:['sum-wp-36676','sum-wp-36681','sum-wp-36685','sum-wp-36688','sum-wp-41820','sum-wp-41827','sum-wp-41828','sum-wp-41830','sum-wp-41832','sum-wp-41834','sum-wp-41839'],
 sumRoyalDen:['sum-wp-36692','sum-wp-36693','sum-wp-41826','sum-wp-41835','sum-wp-41838'],
 tunBlueCut:['sum-wp-36679','sum-wp-36686'],
 sumRedSandWell:['sum-wp-36683','sum-wp-36695'],
 sumDuneVault:['sum-wp-36694','sum-wp-36697','sum-wp-36700','sum-wp-36701','sum-wp-36702'],
 sumSandWindcut:['sum-wp-36687','sum-wp-41836'],
 asimonField:['asimon-field-ruins']
};
await checkTerrainScenes(groups,['sum-wp-36674','sum-wp-36680','sum-wp-36683','sum-wp-36694'],'sumeru');
