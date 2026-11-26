// Prototype host scenery. Production will use the actual 3D scene behind Lua UI.
import {drawScenerySurface} from './scenery-surfaces.js';
export const sceneryDefinitions={
 ochkaBronzeCourt:{file:'ochka-bronze-court-background-v1.png',decodedPreview:'ochka-bronze-court-native-preview-v1.png',decodedTiers:'ochka-bronze-court-native-tiers-v1.webp',surface:'sandstone',zones:['story:ochka-bronzelock-island-court'],note:'北東の浮遊島の遺構のラボ用仮背景'},
 sacredEastDais:{file:'sacred-east-dais-background-v1.png',decodedPreview:'sacred-east-dais-native-preview-v1.png',decodedTiers:'sacred-east-dais-native-tiers-v1.webp',surface:'sandstone',zones:['story:sacred-mountain-east-isle-dais'],note:'東島西の石広場のラボ用仮背景'},
 skySandCourtyard:{file:'sky-sand-courtyard-background-v1.png',decodedPreview:'sky-sand-courtyard-native-preview-v1.png',decodedTiers:'sky-sand-courtyard-native-tiers-v1.webp',surface:'sandstone',zones:['story:sky-maha-pavilion-court'],note:'砂上の楼閣・北西の中庭のラボ用仮背景'},
 bygoneCineasVault:{file:'bygone-cineas-vault-background-v1.png',decodedPreview:'bygone-cineas-vault-native-preview-v1.png',decodedTiers:'bygone-cineas-vault-native-tiers-v1.webp',surface:'cavern',zones:['story:cineas-legend-chamber'],note:'シネアスの石床のラボ用仮背景'},
 dornCookingCamp:{file:'dorn-cooking-camp-background-v1.png',decodedPreview:'dorn-cooking-camp-native-preview-v1.png',decodedTiers:'dorn-cooking-camp-native-tiers-v1.webp',surface:'grass',zones:['story:dorn-churldric-cooking-camp'],note:'シールドル湖北の炊事場のラボ用仮背景'},
 frostInnerChamber:{file:'frost-inner-chamber-background-v1.png',decodedPreview:'frost-inner-chamber-native-preview-v1.png',decodedTiers:'frost-inner-chamber-native-tiers-v1.webp',surface:'cavern',zones:['story:frost-mushteshir-inner-chamber'],note:'ムーシュ＝テヒルの最深室のラボ用仮背景'},
 frostPrismBasin:{file:'frost-prism-basin-background-v1.png',decodedPreview:'frost-prism-basin-native-preview-v1.png',decodedTiers:'frost-prism-basin-native-tiers-v1.webp',surface:'wetSand',zones:['story:frost-prism-slime-basin'],note:'プリズムスライムの水たまりのラボ用仮背景'},
 hiisiCrabPalace:{file:'hiisi-crab-palace-background-v1.png',decodedPreview:'hiisi-crab-palace-native-preview-v1.png',decodedTiers:'hiisi-crab-palace-native-tiers-v1.webp',surface:'cavern',zones:['story:nod-crab-tsar-palace'],note:'ヒーシ島地下の宮殿のラボ用仮背景'},
 hiljettaCamp:{file:'hiljetta-camp-background-v1.png',decodedPreview:'hiljetta-camp-native-preview-v1.png',decodedTiers:'hiljetta-camp-native-tiers-v1.webp',surface:'grass',zones:['story:nod-hiljetta-peninsula-camp'],note:'ハイジェードのキャンプのラボ用仮背景'},
 aamsWolfHall:{file:'aams-wolf-hall-background-v1.png',decodedPreview:'aams-wolf-hall-native-preview-v1.png',decodedTiers:'aams-wolf-hall-native-tiers-v1.webp',surface:'stone',zones:['story:nod-homesick-wolf-lakeland'],note:'孤独の狼の広間のラボ用仮背景'},
 mandragoraCoast:{file:'mandragora-coast-background-v1.png',decodedPreview:'mandragora-coast-native-preview-v1.png',decodedTiers:'mandragora-coast-native-tiers-v1.webp',surface:'wetSand',zones:['story:nod-mandragora-cliff-foot'],note:'十六倍マンドラゴラの海岸のラボ用仮背景'},
 raskolUpperRing:{file:'raskol-upper-ring-background-v1.png',decodedPreview:'raskol-upper-ring-native-preview-v1.png',decodedTiers:'raskol-upper-ring-native-tiers-v1.webp',surface:'stone',zones:['story:nod-raskolnikov-upper-ring'],note:'実験設計局の最上層のラボ用仮背景'},
 sigurdGraveCourt:{file:'sigurd-grave-court-background-v1.png',decodedPreview:'sigurd-grave-court-native-preview-v1.png',decodedTiers:'sigurd-grave-court-native-tiers-v1.webp',surface:'grass',zones:['story:nod-sigurd-grave-court'],note:'ボーンモス荒原の墓前のラボ用仮背景'},
 mercifulMouseDen:{file:'merciful-mouse-den-background-v1.png',decodedPreview:'merciful-mouse-den-native-preview-v1.png',decodedTiers:'merciful-mouse-den-native-tiers-v1.webp',surface:'cavern',zones:['story:sne-ancient-mouse-den'],note:'古代種の巣穴のラボ用仮背景'},
 svetIceCavern:{file:'svet-ice-cavern-background-v1.png',decodedPreview:'svet-ice-cavern-native-preview-v1.png',decodedTiers:'svet-ice-cavern-native-tiers-v1.webp',surface:'ice',zones:['story:sne-bandersnatch-ice-cavern'],note:'バンダースナッチの洞窟のラボ用仮背景'},
 churinSnowCourt:{file:'churin-snow-court-background-v1.png',decodedPreview:'churin-snow-court-native-preview-v1.png',decodedTiers:'churin-snow-court-native-tiers-v1.webp',surface:'snow',zones:['story:sne-churin-snow-court'],note:'チュリンの彫刻広場のラボ用仮背景'},
 crystalTreeRefuge:{file:'crystal-tree-refuge-background-v1.png',decodedPreview:'crystal-tree-refuge-native-preview-v1.png',decodedTiers:'crystal-tree-refuge-native-tiers-v1.webp',surface:'cavern',zones:['story:sne-crystal-tree-refuge'],note:'晶鉱樹洞の支流の隠れ家のラボ用仮背景'},
 furiosaSnowfield:{file:'furiosa-snowfield-background-v1.png',decodedPreview:'furiosa-snowfield-native-preview-v1.png',decodedTiers:'furiosa-snowfield-native-tiers-v1.webp',surface:'snow',zones:['story:sne-furiosa-domain-outlook'],note:'フュリオサの雪原のラボ用仮背景'},
 novokOreYard:{file:'novok-ore-yard-background-v1.png',decodedPreview:'novok-ore-yard-native-preview-v1.png',decodedTiers:'novok-ore-yard-native-tiers-v1.webp',surface:'stone',zones:['story:sne-novokichev-ore-yard'],note:'ノヴォキッチェヴの鉱荷集積場のラボ用仮背景'},
 rilaiMistCourt:{file:'rilai-mist-court-background-v1.png',decodedPreview:'rilai-mist-court-native-preview-v1.png',decodedTiers:'rilai-mist-court-native-tiers-v1.webp',surface:'heather',zones:['story:night-wind-rilai-clearing'],note:'謎煙の主の南西・リライの広場のラボ用仮背景'},
 atocpanTwinMeadow:{file:'atocpan-twin-meadow-background-v1.png',decodedPreview:'atocpan-twin-meadow-native-preview-v1.png',decodedTiers:'atocpan-twin-meadow-native-tiers-v1.webp',surface:'grass',zones:['story:atocpan-battlegoat-ironclaw-field'],note:'火山南・戦羊と鉄爪の広場のラボ用仮背景'},
 atocpanPeakGrotto:{file:'atocpan-peak-grotto-background-v1.png',decodedPreview:'atocpan-peak-grotto-native-preview-v1.png',decodedTiers:'atocpan-peak-grotto-native-tiers-v1.webp',surface:'cavern',zones:['story:atocpan-peak-cave'],note:'アトクパンの大地・ピークの岩洞のラボ用仮背景'},
 zapaTidalFlat:{file:'zapa-tidal-flat-background-v1.png',decodedPreview:'zapa-tidal-flat-native-preview-v1.png',decodedTiers:'zapa-tidal-flat-native-tiers-v1.webp',surface:'wetSand',zones:['story:zapabay-tenochtzitoc-shallows'],note:'ざぶざぶ湾・最後のテノチズトク人の浅瀬のラボ用仮背景'},
 nightWindFork:{file:'night-wind-seaward-fork-background-v1.png',decodedPreview:'night-wind-seaward-fork-native-preview-v1.png',decodedTiers:'night-wind-seaward-fork-native-tiers-v1.webp',surface:'grass',zones:['story:night-wind-seaward-fork'],note:'海を望む崖道の分岐のラボ用仮背景'},
 atocpanPeakTrail:{file:'atocpan-peak-trail-background-v1.png',decodedPreview:'atocpan-peak-trail-native-preview-v1.png',decodedTiers:'atocpan-peak-trail-native-tiers-v1.webp',surface:'sandstone',zones:['story:atocpan-peak-rock-trail'],note:'山腹の岩道のラボ用仮背景'},
 sapphoReedBank:{file:'sappho-reed-bank-background-v1.png',decodedPreview:'sappho-reed-bank-native-preview-v1.png',decodedTiers:'sappho-reed-bank-native-tiers-v1.webp',surface:'grass',zones:['story:tepeakak-sappho-bank'],note:'テペアカク坂・ジャプーの演奏場のラボ用仮背景'},
 cocijoStoneRing:{file:'cocijo-stone-ring-background-v1.png',decodedPreview:'cocijo-stone-ring-native-preview-v1.png',decodedTiers:'cocijo-stone-ring-native-tiers-v1.webp',surface:'sandstone',zones:['story:toyac-cocijo-stone-ring'],note:'アメヤルコの水域・コシーホの石広場のラボ用仮背景'},
 balachkoGrateChamber:{file:'balachko-grate-chamber-background-v1.png',decodedPreview:'balachko-grate-chamber-native-preview-v1.png',decodedTiers:'balachko-grate-chamber-native-tiers-v1.webp',surface:'cavern',zones:['story:toyac-balachko-inner-cave'],note:'アメヤルコの水域・格子奥の岩室のラボ用仮背景'},
 toyacShallowShore:{file:'toyac-shallow-shore-background-v1.png',decodedPreview:'toyac-shallow-shore-native-preview-v1.png',decodedTiers:'toyac-shallow-shore-native-tiers-v1.webp',surface:'sandstone',zones:['story:toyac-electro-crystal-shore'],note:'アメヤルコの水域・電気水晶の岸辺のラボ用仮背景'},
 nightKingdomTrial:{file:'night-kingdom-trial-background-v1.png',decodedPreview:'night-kingdom-trial-native-preview-v1.png',decodedTiers:'night-kingdom-trial-native-tiers-v1.webp',surface:'violetSlate',zones:['story:night-trial-undead','story:night-trial-chimalli','story:night-trial-tlatzacuilotl','story:night-trial-ichcahuipilli','story:night-trial-atlatl','story:night-trial-cihuacoatl','story:night-trial-fallen-dawnstar','story:night-trial-ironbeard','story:night-trial-potapo','story:night-trial-tupayo','story:night-trial-reji','story:night-trial-tupu'],note:'ナタ・夜魂の試練12会場で共用するラボ用仮背景'},
 yseutDrill:{file:'yseut-drill-background-v1.png',decodedPreview:'yseut-drill-native-preview-v1.png',decodedTiers:'yseut-drill-native-tiers-v1.webp',surface:'grass',zones:['story:yseut-legend-court'],note:'西の丘・巡視の訓練場のラボ用仮背景'},
 gravityTestTerrace:{file:'gravity-test-terrace-background-v1.png',decodedPreview:'gravity-test-terrace-native-preview-v1.png',decodedTiers:'gravity-test-terrace-native-tiers-v1.webp',surface:'stone',zones:['story:gravity-device-legend-terrace'],note:'北の岩道・力場試験の台地のラボ用仮背景'},
 rockyFallsLedge:{file:'rocky-falls-ledge-background-v1.png',decodedPreview:'rocky-falls-ledge-native-preview-v1.png',decodedTiers:'rocky-falls-ledge-native-tiers-v1.webp',surface:'stone',zones:['story:rocky-legend-ledge'],note:'東の滝・岩棚の練武場のラボ用仮背景'},
 liamCliffPond:{file:'liam-cliff-pond-background-v1.png',decodedPreview:'liam-cliff-pond-native-preview-v1.png',decodedTiers:'liam-cliff-pond-native-tiers-v1.webp',surface:'grass',zones:['story:liam-legend-pond'],note:'東端の崖・薬瓶の池畔のラボ用仮背景'},
 deianeiraDryLab:{file:'deianeira-dry-lab-background-v1.png',decodedPreview:'deianeira-dry-lab-native-preview-v1.png',decodedTiers:'deianeira-dry-lab-native-tiers-v1.webp',surface:'stone',zones:['story:deianeira-legend-lab'],note:'東の島・水中研究室の乾いた床のラボ用仮背景'},
 erinnyesRootCleft:{file:'corrouge-root-cleft-background-v1.png',decodedPreview:'corrouge-root-cleft-native-preview-v1.png',decodedTiers:'corrouge-root-cleft-native-tiers-v1.webp',zones:['story:erinnyes-corrouge-cleft','story:erinnyes-root-waterway'],note:'エリニュスの根・クルージュの割れ目の仮背景'},
 dobharcuGarden:{file:'hidden-watergarden-background-v1.png',decodedPreview:'hidden-watergarden-native-preview-v1.png',decodedTiers:'hidden-watergarden-native-tiers-v1.webp',zones:['story:dobharcu-legend-garden'],note:'希望の道・隠者の水庭の仮背景'},
 eltonWreck:{file:'veteran-wreck-background-v1.png',decodedPreview:'veteran-wreck-native-preview-v1.png',decodedTiers:'veteran-wreck-native-tiers-v1.webp',zones:['story:fading-veteran-legend-wreck'],note:'エルトン海溝・老兵の沈船跡の仮背景'},
 thalattaRift:{file:'gorge-swords-background-v1.png',decodedPreview:'gorge-swords-native-preview-v1.png',decodedTiers:'gorge-swords-native-tiers-v1.webp',zones:['story:swords-of-the-gorge-legend-rift'],note:'タラッタ海底谷・深谷の剣の割れ目の仮背景'},
 viscountThermalPool:{file:'iron-viscount-background-v1.png',decodedPreview:'iron-viscount-native-preview-v1.png',decodedTiers:'iron-viscount-native-tiers-v1.webp',zones:['story:iron-viscount-legend-pool','story:iron-viscount-thermal-gallery'],note:'ベリル地下・鉄皮の子爵の水洞の仮背景'},
 jadeplumeGrove:{file:'jadeplume-grove-background-v1.png',decodedPreview:'jadeplume-grove-native-preview-v1.png',decodedTiers:'jadeplume-grove-native-tiers-v1.webp',surface:'grass',zones:['story:sumeru-jadeplume-grove'],note:'菌傘の谷のラボ用仮背景'},
 chenyuBoulderGully:{file:'chenyu-boulder-gully-background-v1.png',decodedPreview:'chenyu-boulder-gully-native-preview-v1.png',decodedTiers:'chenyu-boulder-gully-native-tiers-v1.webp',surface:'grass',zones:['story:chenyu-boulder-gully'],note:'段丘の岩陰のラボ用仮背景'},
 enkanTabletHollow:{file:'enkan-tablet-hollow-background-v1.png',decodedPreview:'enkan-tablet-hollow-native-preview-v1.png',decodedTiers:'enkan-tablet-hollow-native-tiers-v1.webp',surface:'stone',zones:['story:enkan-tablet-hollow'],note:'石版裏の窪みのラボ用仮背景'},
 novoIceVault:{file:'novo-ice-vault-background-v1.png',decodedPreview:'novo-ice-vault-native-preview-v1.png',decodedTiers:'novo-ice-vault-native-tiers-v1.webp',surface:'stone',zones:['story:novo-ice-vault'],note:'氷殻の最深室のラボ用仮背景'},
 nodQuietRim:{file:'nod-quiet-rim-background-v1.png',decodedPreview:'nod-quiet-rim-native-preview-v1.png',decodedTiers:'nod-quiet-rim-native-tiers-v1.webp',surface:'grass',zones:['story:nod-quiet-rim'],note:'庭の外周・静かな道のラボ用仮背景'},
 fairyKnightChannel:{file:'fairy-channel-background-v1.png',decodedPreview:'fairy-channel-native-preview-v1.png',decodedTiers:'fairy-channel-native-tiers-v1.webp',surface:'stone',zones:['story:fairy-knight-twins-legend-court'],note:'サラシア海原・妖精の騎士の水路の仮背景'},
 morteBubbleChamber:{file:'morte-bubble-room-background-v1.png',decodedPreview:'morte-bubble-room-native-preview-v1.png',decodedTiers:'morte-bubble-room-native-tiers-v1.webp',surface:'stone',zones:['story:chassanion-legend-bubble-room'],note:'モルテ・シャサニョンの泡室の仮背景'},
 tristarsCamp:{file:'tristars-camp-background-v1.png',decodedPreview:'tristars-camp-native-preview-v1.png',decodedTiers:'tristars-camp-native-tiers-v1.webp',surface:'grass',zones:['story:witztli-tristars-camp'],note:'ウィッツトリの丘・三連星の野営場の仮背景'},
 ninianneSpringBank:{file:'lake-ninianne-bank-background-v1.png',decodedPreview:'lake-ninianne-bank-native-preview-v1.png',decodedTiers:'lake-ninianne-bank-native-tiers-v1.webp',surface:'stone',zones:['story:ninianne-legend-bank'],note:'西岬・ニニアンの湧水棚の仮背景'},
 vivianneLakeBank:{file:'lake-vivianne-bank-background-v1.png',decodedPreview:'lake-vivianne-bank-native-preview-v1.png',decodedTiers:'lake-vivianne-bank-native-tiers-v1.webp',surface:'grass',zones:['story:vivianne-legend-bank'],note:'フォンテーヌ廷北・ヴィヴィアンの湖岸の仮背景'},
 sunderedForge:{file:'sundered-forge-background-v1.png',decodedPreview:'sundered-forge-native-preview-v1.png',decodedTiers:'sundered-forge-native-tiers-v1.webp',surface:'stone',zones:['story:primal-fire-sundered-forge'],note:'源焔の再現戦の仮背景'},
 crimsonMoonCourt:{file:'crimson-moon-court-background-v1.png',decodedPreview:'crimson-moon-court-native-preview-v1.png',decodedTiers:'crimson-moon-court-native-tiers-v1.webp',surface:'lacquer',zones:['story:knave-crimson-court'],note:'凶月の再現戦の仮背景'},
 starSea:{file:'narwhal-star-sea-background-v1.png',decodedPreview:'narwhal-star-sea-native-preview-v1.png',decodedTiers:'narwhal-star-sea-native-tiers-v1.webp',surface:'violetSlate',zones:['story:narwhal-star-sea'],note:'星海の再現戦の仮背景'},
 oasisHeart:{file:'oasis-heart-background-v1.png',decodedPreview:'oasis-heart-native-preview-v1.png',decodedTiers:'oasis-heart-native-tiers-v1.webp',surface:'grass',zones:['story:apep-oasis-heart-arena'],note:'オアシスの心の再現戦の仮背景'},
 tenshukakuDuel:{file:'tenshukaku-duel-background-v1.png',decodedPreview:'tenshukaku-duel-native-preview-v1.png',decodedTiers:'tenshukaku-duel-native-tiers-v1.webp',surface:'lacquer',zones:['story:signora-ten-shrine-arena'],note:'天守閣・御前試合場の仮背景'},
 euthymiaDuel:{file:'euthymia-duel-background-v1.png',decodedPreview:'euthymia-duel-native-preview-v1.png',decodedTiers:'euthymia-duel-native-tiers-v1.webp',surface:'violetSlate',zones:['story:raiden-thunder-echo-arena'],note:'鳴神追憶の異空間の仮背景'},
 godmakingHall:{file:'godmaking-hall-background-v1.png',decodedPreview:'godmaking-hall-native-preview-v1.png',decodedTiers:'godmaking-hall-native-tiers-v1.webp',surface:'stone',zones:['story:shouki-godmaking-arena'],note:'スメール・造神工房の仮背景'},
 chenyuDepthTrail:{file:'chenyu-depth-trail-background-v1.png',decodedPreview:'chenyu-depth-trail-native-preview-v1.png',decodedTiers:'chenyu-depth-trail-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64845'],note:'探索路の仮背景'},
 chenyuFernDen:{file:'chenyu-fern-den-background-v1.png',decodedPreview:'chenyu-fern-den-native-preview-v1.png',decodedTiers:'chenyu-fern-den-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64845-pocket-1'],note:'探索路・玄文獣の蕨穴の仮背景'},
 chenyuFoothillTurn:{file:'chenyu-foothill-turn-background-v1.png',decodedPreview:'chenyu-foothill-turn-native-preview-v1.png',decodedTiers:'chenyu-foothill-turn-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64846'],note:'山裾の曲がり道の仮背景'},
 chenyuSpringGully:{file:'chenyu-spring-gully-background-v1.png',decodedPreview:'chenyu-spring-gully-native-preview-v1.png',decodedTiers:'chenyu-spring-gully-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64846-pocket-1'],note:'曲がり道・水レンジャーの石樋の仮背景'},
 chenyuSouthScree:{file:'chenyu-south-scree-background-v1.png',decodedPreview:'chenyu-south-scree-native-preview-v1.png',decodedTiers:'chenyu-south-scree-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64847'],note:'南側の岩斜面の仮背景'},
 chenyuShaleDen:{file:'chenyu-shale-den-background-v1.png',decodedPreview:'chenyu-shale-den-native-preview-v1.png',decodedTiers:'chenyu-shale-den-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64847-pocket-1'],note:'南斜面・玄文獣の割岩の仮背景'},
 chenyuSouthFork:{file:'chenyu-south-fork-background-v1.png',decodedPreview:'chenyu-south-fork-native-preview-v1.png',decodedTiers:'chenyu-south-fork-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64848'],note:'谷南の分岐の仮背景'},
 chenyuShieldYard:{file:'chenyu-shield-yard-background-v1.png',decodedPreview:'chenyu-shield-yard-native-preview-v1.png',decodedTiers:'chenyu-shield-yard-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64848-pocket-1'],note:'谷南・岩盾暴徒の石塁の仮背景'},
 chenyuWestVault:{file:'chenyu-west-vault-background-v1.png',decodedPreview:'chenyu-west-vault-native-preview-v1.png',decodedTiers:'chenyu-west-vault-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64849'],note:'西峰の石室の仮背景'},
 chenyuJadeNiche:{file:'chenyu-jade-niche-background-v1.png',decodedPreview:'chenyu-jade-niche-native-preview-v1.png',decodedTiers:'chenyu-jade-niche-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64849-pocket-1'],note:'西峰・玄文獣の玉座の間の仮背景'},
 chenyuTrailCamp:{file:'chenyu-trail-camp-background-v1.png',decodedPreview:'chenyu-trail-camp-native-preview-v1.png',decodedTiers:'chenyu-trail-camp-native-tiers-v1.webp',surface:'timber',zones:['story:branch-hunt-64850'],note:'入口拠点の茶小屋の仮背景'},
 chenyuBannerLedge:{file:'chenyu-banner-ledge-background-v1.png',decodedPreview:'chenyu-banner-ledge-native-preview-v1.png',decodedTiers:'chenyu-banner-ledge-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64850-pocket-1'],note:'拠点裏・風レンジャーの吹き流し台の仮背景'},
 chenyuHarborBluff:{file:'chenyu-harbor-bluff-background-v1.png',decodedPreview:'chenyu-harbor-bluff-native-preview-v1.png',decodedTiers:'chenyu-harbor-bluff-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-66768'],note:'港西の山縁の仮背景'},
 chenyuBrineStep:{file:'chenyu-brine-step-background-v1.png',decodedPreview:'chenyu-brine-step-native-preview-v1.png',decodedTiers:'chenyu-brine-step-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-66768-pocket-1'],note:'港西・水レンジャーの潮溜まりの仮背景'},
 chenyuCargoWharf:{file:'chenyu-cargo-wharf-background-v1.png',decodedPreview:'chenyu-cargo-wharf-native-preview-v1.png',decodedTiers:'chenyu-cargo-wharf-native-tiers-v1.webp',surface:'timber',zones:['story:branch-hunt-66769','story:liyue-crux-wharf','story:liyue-wp-104'],note:'谷北の埠頭の仮背景'},
 chenyuOuterReef:{file:'chenyu-outer-reef-background-v1.png',decodedPreview:'chenyu-outer-reef-native-preview-v1.png',decodedTiers:'chenyu-outer-reef-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-66770'],note:'谷南の沖合の岩礁の仮背景'},
 chenyuTideDen:{file:'chenyu-tide-den-background-v1.png',decodedPreview:'chenyu-tide-den-native-preview-v1.png',decodedTiers:'chenyu-tide-den-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-66770-pocket-1'],note:'沖合・玄文獣の潮穴の仮背景'},
 chenyuHiddenGrotto:{file:'chenyu-hidden-grotto-background-v1.png',decodedPreview:'chenyu-hidden-grotto-native-preview-v1.png',decodedTiers:'chenyu-hidden-grotto-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-66979'],note:'北尾根の隠れ石窟の仮背景'},
 chenyuEchoVault:{file:'chenyu-echo-vault-background-v1.png',decodedPreview:'chenyu-echo-vault-native-preview-v1.png',decodedTiers:'chenyu-echo-vault-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-66979-pocket-1'],note:'北尾根・玄文獣の反響洞の仮背景'},
 chenyuNeedlePeak:{file:'chenyu-needle-peak-background-v1.png',decodedPreview:'chenyu-needle-peak-native-preview-v1.png',decodedTiers:'chenyu-needle-peak-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64840'],note:'湖の北の石峰の仮背景'},
 chenyuSaddle:{file:'chenyu-high-saddle-background-v1.png',decodedPreview:'chenyu-high-saddle-native-preview-v1.png',decodedTiers:'chenyu-high-saddle-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64841'],note:'谷北の尾根道の仮背景'},
 chenyuRainCatch:{file:'chenyu-rain-catch-background-v1.png',decodedPreview:'chenyu-rain-catch-native-preview-v1.png',decodedTiers:'chenyu-rain-catch-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64841-pocket-1'],note:'尾根裏・水レンジャーの雨受けの仮背景'},
 chenyuReedBend:{file:'chenyu-reed-bend-background-v1.png',decodedPreview:'chenyu-reed-bend-native-preview-v1.png',decodedTiers:'chenyu-reed-bend-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64842'],note:'谷東の川沿いの仮背景'},
 chenyuWindArch:{file:'chenyu-wind-arch-background-v1.png',decodedPreview:'chenyu-wind-arch-native-preview-v1.png',decodedTiers:'chenyu-wind-arch-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64842-pocket-1'],note:'川東・風レンジャーの石窓の仮背景'},
 chenyuNorthFerry:{file:'chenyu-north-ferry-background-v1.png',decodedPreview:'chenyu-north-ferry-native-preview-v1.png',decodedTiers:'chenyu-north-ferry-native-tiers-v1.webp',surface:'timber',zones:['story:branch-hunt-64844'],note:'川の北岸の渡し場の仮背景'},
 chenyuSailLoft:{file:'chenyu-sail-loft-background-v1.png',decodedPreview:'chenyu-sail-loft-native-preview-v1.png',decodedTiers:'chenyu-sail-loft-native-tiers-v1.webp',surface:'timber',zones:['story:branch-hunt-64844-pocket-1'],note:'渡し裏・風レンジャーの帆干し場の仮背景'},
 chenyuPostRoad:{file:'chenyu-post-road-background-v1.png',decodedPreview:'chenyu-post-road-native-preview-v1.png',decodedTiers:'chenyu-post-road-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64834'],note:'西岸の宿場道の仮背景'},
 chenyuPostQuarry:{file:'chenyu-post-quarry-background-v1.png',decodedPreview:'chenyu-post-quarry-native-preview-v1.png',decodedTiers:'chenyu-post-quarry-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64834-pocket-1'],note:'宿場裏の切石場の仮背景'},
 chenyuStreamTea:{file:'chenyu-stream-tea-background-v1.png',decodedPreview:'chenyu-stream-tea-native-preview-v1.png',decodedTiers:'chenyu-stream-tea-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64835'],note:'沢沿いの茶棚の仮背景'},
 chenyuCascade:{file:'chenyu-stream-cascade-background-v1.png',decodedPreview:'chenyu-stream-cascade-native-preview-v1.png',decodedTiers:'chenyu-stream-cascade-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64835-pocket-1'],note:'茶棚の奥の滝壺の仮背景'},
 chenyuShale:{file:'chenyu-stream-shale-background-v1.png',decodedPreview:'chenyu-stream-shale-native-preview-v1.png',decodedTiers:'chenyu-stream-shale-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64835-pocket-2'],note:'沢底の岩層の仮背景'},
 chenyuEastLake:{file:'chenyu-east-lake-background-v1.png',decodedPreview:'chenyu-east-lake-native-preview-v1.png',decodedTiers:'chenyu-east-lake-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64836'],note:'湖東の小径の仮背景'},
 chenyuWillowDen:{file:'chenyu-lake-willow-den-background-v1.png',decodedPreview:'chenyu-lake-willow-den-native-preview-v1.png',decodedTiers:'chenyu-lake-willow-den-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64836-pocket-1'],note:'柳根の岩陰の仮背景'},
 chenyuPebbleBed:{file:'chenyu-lake-pebble-bed-background-v1.png',decodedPreview:'chenyu-lake-pebble-bed-native-preview-v1.png',decodedTiers:'chenyu-lake-pebble-bed-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64836-pocket-2'],note:'浅瀬の丸石浜の仮背景'},
 chenyuHarborBamboo:{file:'chenyu-harbor-bamboo-background-v1.png',decodedPreview:'chenyu-harbor-bamboo-native-preview-v1.png',decodedTiers:'chenyu-harbor-bamboo-native-tiers-v1.webp',surface:'timber',zones:['story:branch-hunt-64838'],note:'港東の竹道の仮背景'},
 chenyuNorthEdge:{file:'chenyu-north-edge-background-v1.png',decodedPreview:'chenyu-north-edge-native-preview-v1.png',decodedTiers:'chenyu-north-edge-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64839'],note:'見晴らし岩の北尾根の仮背景'},
 chenyuStonehelm:{file:'chenyu-north-stonehelm-background-v1.png',decodedPreview:'chenyu-north-stonehelm-native-preview-v1.png',decodedTiers:'chenyu-north-stonehelm-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64839-pocket-1'],note:'北尾根の岩門の仮背景'},
 chenyuGrassSteps:{file:'chenyu-grass-steps-background-v1.png',decodedPreview:'chenyu-grass-steps-native-preview-v1.png',decodedTiers:'chenyu-grass-steps-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64830'],note:'南東の草段の仮背景'},
 chenyuAmberHollow:{file:'chenyu-amber-hollow-background-v1.png',decodedPreview:'chenyu-amber-hollow-native-preview-v1.png',decodedTiers:'chenyu-amber-hollow-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64830-pocket-1'],note:'草段の琥珀岩の仮背景'},
 chenyuLakePier:{file:'chenyu-lake-pier-background-v1.png',decodedPreview:'chenyu-lake-pier-native-preview-v1.png',decodedTiers:'chenyu-lake-pier-native-tiers-v1.webp',surface:'timber',zones:['story:branch-hunt-64831'],note:'湖西の小桟橋の仮背景'},
 chenyuReedIsland:{file:'chenyu-reed-island-background-v1.png',decodedPreview:'chenyu-reed-island-native-preview-v1.png',decodedTiers:'chenyu-reed-island-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64831-pocket-1'],note:'湖西の葦洲の仮背景'},
 chenyuAqueduct:{file:'chenyu-lake-aqueduct-background-v1.png',decodedPreview:'chenyu-lake-aqueduct-native-preview-v1.png',decodedTiers:'chenyu-lake-aqueduct-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64832'],note:'湖西の水路跡の仮背景'},
 chenyuCulvert:{file:'chenyu-lake-culvert-background-v1.png',decodedPreview:'chenyu-lake-culvert-native-preview-v1.png',decodedTiers:'chenyu-lake-culvert-native-tiers-v1.webp',surface:'stone',zones:['story:branch-hunt-64832-pocket-1'],note:'水路の石樋の仮背景'},
 chenyuRiverBendTea:{file:'chenyu-river-bend-tea-background-v1.png',decodedPreview:'chenyu-river-bend-tea-native-preview-v1.png',decodedTiers:'chenyu-river-bend-tea-native-tiers-v1.webp',surface:'grass',zones:['story:branch-hunt-64833'],note:'川曲がりの茶畑の仮背景'},
 chenyuTeaStore:{file:'chenyu-river-tea-store-background-v1.png',decodedPreview:'chenyu-river-tea-store-native-preview-v1.png',decodedTiers:'chenyu-river-tea-store-native-tiers-v1.webp',surface:'timber',zones:['story:branch-hunt-64833-pocket-1'],note:'茶畑の旧蔵の仮背景'},
 chenyuTwinVishapCourt:{file:'chenyu-twin-vishap-court-background-v1.png',decodedPreview:'chenyu-twin-vishap-court-native-preview-v1.png',decodedTiers:'chenyu-twin-vishap-court-native-tiers-v1.webp',surface:'stone',zones:['story:chizhang-legend-terrace'],note:'赤璋の丘の双龍の段丘の仮背景'},
 chenyuWestBank:{file:'chenyu-west-bank-background-v1.png',decodedPreview:'chenyu-west-bank-native-preview-v1.png',decodedTiers:'chenyu-west-bank-native-tiers-v1.webp',zones:['story:branch-hunt-64826'],note:'西岸の石畳の仮背景'},
 chenyuRootDen:{file:'chenyu-root-den-background-v1.png',decodedPreview:'chenyu-root-den-native-preview-v1.png',decodedTiers:'chenyu-root-den-native-tiers-v1.webp',zones:['story:branch-hunt-64826-pocket-1'],note:'根の張る岩屋の仮背景'},
 chenyuWestPeak:{file:'chenyu-west-peak-background-v1.png',decodedPreview:'chenyu-west-peak-native-preview-v1.png',decodedTiers:'chenyu-west-peak-native-tiers-v1.webp',zones:['story:branch-hunt-64827'],note:'西峰の石棚の仮背景'},
 chenyuWindLookout:{file:'chenyu-wind-lookout-background-v1.png',decodedPreview:'chenyu-wind-lookout-native-preview-v1.png',decodedTiers:'chenyu-wind-lookout-native-tiers-v1.webp',zones:['story:branch-hunt-64827-pocket-1'],note:'風渡る見張り台の仮背景'},
 chenyuFerry:{file:'chenyu-west-ferry-background-v1.png',decodedPreview:'chenyu-west-ferry-native-preview-v1.png',decodedTiers:'chenyu-west-ferry-native-tiers-v1.webp',zones:['story:branch-hunt-64828'],note:'西岸の渡し場の仮背景'},
 chenyuFloodShrine:{file:'chenyu-flood-shrine-background-v1.png',decodedPreview:'chenyu-flood-shrine-native-preview-v1.png',decodedTiers:'chenyu-flood-shrine-native-tiers-v1.webp',zones:['story:branch-hunt-64828-pocket-1'],note:'水際の祠の仮背景'},
 chenyuSouthPass:{file:'chenyu-south-pass-background-v1.png',decodedPreview:'chenyu-south-pass-native-preview-v1.png',decodedTiers:'chenyu-south-pass-native-tiers-v1.webp',zones:['story:branch-hunt-64829'],note:'南端の山道の仮背景'},
 chenyuFernHollow:{file:'chenyu-fern-hollow-background-v1.png',decodedPreview:'chenyu-fern-hollow-native-preview-v1.png',decodedTiers:'chenyu-fern-hollow-native-tiers-v1.webp',zones:['story:branch-hunt-64829-pocket-1'],note:'山陰のシダの窪地の仮背景'},
 bygoneCoralGallery:{file:'bygone-coral-gallery-background-v1.png',decodedPreview:'bygone-coral-gallery-native-preview-v1.png',decodedTiers:'bygone-coral-gallery-native-tiers-v1.webp',zones:['story:branch-hunt-68600'],note:'珊瑚水路の乾いた回廊の仮背景'},
 bygoneSiltChamber:{file:'bygone-silt-chamber-background-v1.png',decodedPreview:'bygone-silt-chamber-native-preview-v1.png',decodedTiers:'bygone-silt-chamber-native-tiers-v1.webp',zones:['story:branch-hunt-68603'],note:'西の沈殿物の石室の仮背景'},
 bygoneSouthSeal:{file:'bygone-south-seal-background-v1.png',decodedPreview:'bygone-south-seal-native-preview-v1.png',decodedTiers:'bygone-south-seal-native-tiers-v1.webp',zones:['story:branch-hunt-68607'],note:'南岸の密閉室の仮背景'},
 chenyuGateTeaBanks:{file:'chenyu-gate-tea-banks-background-v1.png',decodedPreview:'chenyu-gate-tea-banks-native-preview-v1.png',decodedTiers:'chenyu-gate-tea-banks-native-tiers-v1.webp',zones:['story:branch-hunt-64825'],note:'谷口の茶畑の仮背景'},
 chenyuGateReedPool:{file:'chenyu-gate-reed-pool-background-v1.png',decodedPreview:'chenyu-gate-reed-pool-native-preview-v1.png',decodedTiers:'chenyu-gate-reed-pool-native-tiers-v1.webp',zones:['story:branch-hunt-64825-pocket-1'],note:'谷口の葦の淵の仮背景'},
 chenyuSouthLimestone:{file:'chenyu-south-limestone-background-v1.png',decodedPreview:'chenyu-south-limestone-native-preview-v1.png',decodedTiers:'chenyu-south-limestone-native-tiers-v1.webp',zones:['story:branch-hunt-64824'],note:'南の神像の石灰棚の仮背景'},
 chenyuBeastBamboo:{file:'chenyu-beast-bamboo-background-v1.png',decodedPreview:'chenyu-beast-bamboo-native-preview-v1.png',decodedTiers:'chenyu-beast-bamboo-native-tiers-v1.webp',zones:['story:branch-hunt-64824-pocket-1'],note:'玄文獣の竹林の仮背景'},
 chenyuGuardianSluice:{file:'chenyu-guardian-sluice-background-v1.png',decodedPreview:'chenyu-guardian-sluice-native-preview-v1.png',decodedTiers:'chenyu-guardian-sluice-native-tiers-v1.webp',zones:['story:branch-hunt-64824-pocket-2'],note:'遺跡守衛の古い堰の仮背景'},
 chenyuSentinelKiln:{file:'chenyu-sentinel-kiln-background-v1.png',decodedPreview:'chenyu-sentinel-kiln-native-preview-v1.png',decodedTiers:'chenyu-sentinel-kiln-native-tiers-v1.webp',zones:['story:branch-hunt-64824-pocket-3'],note:'遺跡機兵の窯跡の仮背景'},
 bygoneBellArchive:{file:'bygone-resonance-background-v1.png',decodedPreview:'bygone-resonance-native-preview-v1.png',decodedTiers:'bygone-resonance-native-tiers-v1.webp',zones:['story:bygone-bell-archive'],note:'潮鐘の記録室の仮背景'},
 spineSummitSteps:{file:'spine-summit-steps-background-v1.png',decodedPreview:'spine-summit-steps-native-preview-v1.png',decodedTiers:'spine-summit-steps-native-tiers-v1.webp',zones:['story:sites-hunt-7164'],note:'フィンドニールの頂上・雪の石段の仮背景'},
 nostoiTidalVault:{file:'nostoi-tidal-vault-background-v1.png',decodedPreview:'nostoi-tidal-vault-native-preview-v1.png',decodedTiers:'nostoi-tidal-vault-native-tiers-v1.webp',zones:['story:sites-hunt-68346-pocket-1'],note:'桟橋の潮だまりの仮背景'},
 nostoiIslandPier:{file:'nostoi-island-pier-background-v1.png',decodedPreview:'nostoi-island-pier-native-preview-v1.png',decodedTiers:'nostoi-island-pier-native-tiers-v1.webp',zones:['story:sites-hunt-68346','story:fon-wp-68341'],note:'島南の石桟橋の仮背景'},
 chasmGeodeDen:{file:'chasm-geode-den-background-v1.png',decodedPreview:'chasm-geode-den-native-preview-v1.png',decodedTiers:'chasm-geode-den-native-tiers-v1.webp',zones:['story:sites-hunt-24907-pocket-1'],note:'岩柱の晶洞の仮背景'},
 chasmQuarryLedge:{file:'chasm-quarry-ledge-background-v1.png',decodedPreview:'chasm-quarry-ledge-native-preview-v1.png',decodedTiers:'chasm-quarry-ledge-native-tiers-v1.webp',zones:['story:sites-hunt-24907','story:liyue-wp-26445'],note:'採掘場の北の段丘の仮背景'},
 sumEastGrove:{file:'sum-east-grove-background-v1.png',decodedPreview:'sum-east-grove-native-preview-v1.png',decodedTiers:'sum-east-grove-native-tiers-v1.webp',zones:['story:sites-hunt-28752'],note:'東の森の石門の仮背景'},
 sumNorthBough:{file:'sum-north-bough-background-v1.png',decodedPreview:'sum-north-bough-native-preview-v1.png',decodedTiers:'sum-north-bough-native-tiers-v1.webp',zones:['story:sites-hunt-28753'],note:'北森の枝道の仮背景'},
 sumSouthRavine:{file:'sum-south-ravine-background-v1.png',decodedPreview:'sum-south-ravine-native-preview-v1.png',decodedTiers:'sum-south-ravine-native-tiers-v1.webp',zones:['story:sites-hunt-28756'],note:'南の谷の水棚の仮背景'},
 sumCityWaterGate:{file:'sum-city-water-gate-background-v1.png',decodedPreview:'sum-city-water-gate-native-preview-v1.png',decodedTiers:'sum-city-water-gate-native-tiers-v1.webp',zones:['story:sites-hunt-41009'],note:'都市東の征討入口の仮背景'},
 sumRootRuins:{file:'sum-root-ruins-background-v1.png',decodedPreview:'sum-root-ruins-native-preview-v1.png',decodedTiers:'sum-root-ruins-native-tiers-v1.webp',zones:['story:sites-hunt-98499'],note:'北岸の根に沈む跡地の仮背景'},
 tunNorthPass:{file:'tun-north-pass-background-v1.png',decodedPreview:'tun-north-pass-native-preview-v1.png',decodedTiers:'tun-north-pass-native-tiers-v1.webp',zones:['story:sites-hunt-46531'],note:'北の灰晶坂の仮背景'},
 tunNorthSeep:{file:'tun-north-seep-background-v1.png',decodedPreview:'tun-north-seep-native-preview-v1.png',decodedTiers:'tun-north-seep-native-tiers-v1.webp',zones:['story:sites-hunt-46531-pocket-1'],note:'灰晶の湧水洞の仮背景'},
 tunFlowerTerrace:{file:'tun-flower-terrace-background-v1.png',decodedPreview:'tun-flower-terrace-native-preview-v1.png',decodedTiers:'tun-flower-terrace-native-tiers-v1.webp',zones:['story:sites-hunt-46532'],note:'花海の泉辺の仮背景'},
 tunEmberAlcove:{file:'tun-ember-alcove-background-v1.png',decodedPreview:'tun-ember-alcove-native-preview-v1.png',decodedTiers:'tun-ember-alcove-native-tiers-v1.webp',zones:['story:sites-hunt-46532-pocket-1'],note:'花海の炭焼き跡の仮背景'},
 tunBlueCut:{file:'tun-blue-cut-background-v1.png',decodedPreview:'tun-blue-cut-native-preview-v1.png',decodedTiers:'tun-blue-cut-native-tiers-v1.webp',zones:['story:sites-hunt-46533'],note:'蒼漠の風食廊の仮背景'},
 tunDryCistern:{file:'tun-dry-cistern-background-v1.png',decodedPreview:'tun-dry-cistern-native-preview-v1.png',decodedTiers:'tun-dry-cistern-native-tiers-v1.webp',zones:['story:sites-hunt-46533-pocket-1'],note:'蒼漠の地下水槽の仮背景'},
 tunSouthIncline:{file:'tun-south-incline-background-v1.png',decodedPreview:'tun-south-incline-native-preview-v1.png',decodedTiers:'tun-south-incline-native-tiers-v1.webp',zones:['story:sites-hunt-46534'],note:'蒼漠南の赤い斜面の仮背景'},
 tunAshFissure:{file:'tun-ash-fissure-background-v1.png',decodedPreview:'tun-ash-fissure-native-preview-v1.png',decodedTiers:'tun-ash-fissure-native-tiers-v1.webp',zones:['story:sites-hunt-46534-pocket-1'],note:'南峡谷の灰の洞の仮背景'},
 dualCourt:{file:'farka-dual-court-background-v1.png',decodedPreview:'farka-dual-court-native-preview-v1.png',decodedTiers:'farka-dual-court-native-tiers-v1.webp',zones:['story:mond-stygian-dual-court'],note:'二刀の鍛錬場のラボ用仮背景'},
 windcourt:{file:'wanderer-windcourt-background-v1.png',decodedPreview:'wanderer-windcourt-native-preview-v1.png',decodedTiers:'wanderer-windcourt-native-tiers-v1.webp',zones:['story:sumeru-stygian-windcourt'],note:'風渡りの空中闘場のラボ用仮背景'},
 lastJudgment:{file:'false-moon-rift-background-v1.png',decodedPreview:'false-moon-rift-native-preview-v1.png',decodedTiers:'false-moon-rift-native-tiers-v1.webp',zones:['story:sne-stygian-last-gate'],note:'最後の審問のラボ用仮背景'},
 mistHunt:{file:'false-moon-rift-background-v1.png',decodedPreview:'false-moon-rift-native-preview-v1.png',decodedTiers:'false-moon-rift-native-tiers-v1.webp',zones:['story:nod-stygian-hunt'],note:'霧と月の狩場の仮背景（異界の画像を流用）'},
 solarSparringCourt:{file:'xbalanque-court-background-v1.png',decodedPreview:'xbalanque-court-native-preview-v1.png',decodedTiers:'xbalanque-court-native-tiers-v1.webp',zones:['story:natlan-solar-court'],note:'烈日の手合わせ場の仮背景'},
 frostDrillCourt:{file:'capitano-court-background-v1.png',decodedPreview:'capitano-court-native-preview-v1.png',decodedTiers:'capitano-court-native-tiers-v1.webp',zones:['story:sne-stygian-frost-court'],note:'凍天の演武場の仮背景'},
 cruxDuelDeck:{file:'beidou-stygian-deck-background-v1.png',decodedPreview:'beidou-stygian-deck-native-preview-v1.png',decodedTiers:'beidou-stygian-deck-native-tiers-v1.webp',zones:['story:liyue-stygian-deck'],note:'南十字の試合甲板の仮背景'},
 hereticLattice:{file:'heretic-lattice-background-v1.png',decodedPreview:'heretic-lattice-native-preview-v1.png',decodedTiers:'heretic-lattice-native-tiers-v1.webp',zones:['story:sumeru-heretic-lattice'],note:'左道の結合格子の仮背景'},
 falseMoonCourt:{file:'false-moon-court-background-v1.png',decodedPreview:'false-moon-court-native-preview-v1.png',decodedTiers:'false-moon-court-native-tiers-v1.webp',zones:['story:nod-false-moon-court'],note:'偽月の外界の仮背景'},
 falseMoonRift:{file:'false-moon-rift-background-v1.png',decodedPreview:'false-moon-rift-native-preview-v1.png',decodedTiers:'false-moon-rift-native-tiers-v1.webp',zones:['story:nod-false-moon-rift'],note:'偽月の異界の仮背景'},
 gateCourt:{file:'gate-court-background-v1.png',decodedPreview:'gate-court-native-preview-v1.png',decodedTiers:'gate-court-native-tiers-v1.webp',zones:['story:mond-gate-chess-court'],note:'扉の対局の仮背景'},
 tulpaField:{file:'tulpa-field-background-v1.png',decodedPreview:'tulpa-field-native-preview-v1.png',decodedTiers:'tulpa-field-native-tiers-v1.webp',zones:['story:tulpa-field-grotto'],note:'潮影の洞と星海の仮背景'},
 narwhalInner:{file:'narwhal-inner-background-v1.png',decodedPreview:'narwhal-inner-native-preview-v1.png',decodedTiers:'narwhal-inner-native-tiers-v1.webp',zones:['story:narwhal-inner-echo'],note:'腹中の仮背景'},
 icewindField:{file:'icewind-field-background-v1.png',decodedPreview:'icewind-field-native-preview-v1.png',decodedTiers:'icewind-field-native-tiers-v1.webp',zones:['story:icewind-promenade','story:icewind-coppelia-field','story:icewind-coppelius-field'],note:'氷風組曲の舞台の仮背景'},
 legatusField:{file:'legatus-field-background-v1.png',decodedPreview:'legatus-field-native-preview-v1.png',decodedTiers:'legatus-field-native-tiers-v1.webp',zones:['story:nostoi-castle-approach','story:legatus-field-hall'],note:'色褪せた城の仮背景'},
 suanniField:{file:'suanni-field-background-v1.png',decodedPreview:'suanni-field-native-preview-v1.png',decodedTiers:'suanni-field-native-tiers-v1.webp',zones:['story:suanni-field-sanctum'],note:'懸練山の石庭の仮背景'},
 qucusaurField:{file:'qucusaur-field-background-v1.png',decodedPreview:'qucusaur-field-native-preview-v1.png',decodedTiers:'qucusaur-field-native-tiers-v1.webp',zones:['story:qucusaur-field-cavern'],note:'金焔の岩窟の仮背景'},
 yumkaField:{file:'yumka-field-background-v1.png',decodedPreview:'yumka-field-native-preview-v1.png',decodedTiers:'yumka-field-native-tiers-v1.webp',zones:['story:yumka-field-ravine'],note:'山王の峡谷の仮背景'},
 configDeviceField:{file:'config-device-field-background-v1.png',decodedPreview:'config-device-field-native-preview-v1.png',decodedTiers:'config-device-field-native-tiers-v1.webp',zones:['story:config-device-field-workshop'],note:'秘源の機構室の仮背景'},
 papillaField:{file:'papilla-field-background-v1.png',decodedPreview:'papilla-field-native-preview-v1.png',decodedTiers:'papilla-field-native-tiers-v1.webp',zones:['story:papilla-field-hollow'],note:'紫影の石窟の仮背景'},
 lavaDragonField:{file:'lava-dragon-field-background-v1.png',decodedPreview:'lava-dragon-field-native-preview-v1.png',decodedTiers:'lava-dragon-field-native-tiers-v1.webp',zones:['story:atocpan-lava-field'],note:'溶岩棚と源焔の再現戦の仮背景'},
 overseerField:{file:'overseer-field-background-v1.png',decodedPreview:'overseer-field-native-preview-v1.png',decodedTiers:'overseer-field-native-tiers-v1.webp',zones:['story:atocpan-overseer-ruin'],note:'統御の遺構の仮背景'},
 duckleField:{file:'knuckle-duckle-field-background-v1.png',decodedPreview:'knuckle-duckle-field-native-preview-v1.png',decodedTiers:'knuckle-duckle-field-native-tiers-v1.webp',zones:['story:nod-duckle-workyard'],note:'工房裏の試運転場の仮背景'},
 battleshipField:{file:'battleship-field-background-v1.png',decodedPreview:'battleship-field-native-preview-v1.png',decodedTiers:'battleship-field-native-tiers-v1.webp',zones:['story:nod-battleship-depot'],note:'陸巡艦の整備庫の仮背景'},
 herraField:{file:'frostnight-herra-field-background-v1.png',decodedPreview:'frostnight-herra-field-native-preview-v1.png',decodedTiers:'frostnight-herra-field-native-tiers-v1.webp',zones:['story:nod-herra-terrace'],note:'霜夜の石壇の仮背景'},
 nightmareField:{file:'whisperer-nightmares-field-background-v1.png',decodedPreview:'whisperer-nightmares-field-native-preview-v1.png',decodedTiers:'whisperer-nightmares-field-native-tiers-v1.webp',zones:['story:nod-nightmare-shore'],note:'煙雲の山の昏き浜の仮背景'},
 moonflyField:{file:'moonfly-field-background-v1.png',decodedPreview:'moonfly-field-native-preview-v1.png',decodedTiers:'moonfly-field-native-tiers-v1.webp',zones:['story:nod-moonfly-hollow'],note:'幻月蝶の岩窟の仮背景'},
 moongeckoField:{file:'moongecko-field-background-v1.png',decodedPreview:'moongecko-field-native-preview-v1.png',decodedTiers:'moongecko-field-native-tiers-v1.webp',zones:['story:nod-gecko-depths'],note:'波追いの峠の月石洞の仮背景'},
 spiritspeakerField:{file:'spiritspeaker-field-background-v1.png',decodedPreview:'spiritspeaker-field-native-preview-v1.png',decodedTiers:'spiritspeaker-field-native-tiers-v1.webp',zones:['story:spiritspeaker-field-grotto'],note:'謎煙の修練窟の仮背景'},
 vigilField:{file:'fallen-vigil-field-background-v1.png',decodedPreview:'fallen-vigil-field-native-preview-v1.png',decodedTiers:'fallen-vigil-field-native-tiers-v1.webp',zones:['story:windrest-vigil-court'],note:'風息山の石庭の仮背景'},
 flugelField:{file:'flugel-field-background-v1.png',decodedPreview:'flugel-field-native-preview-v1.png',decodedTiers:'flugel-field-native-tiers-v1.webp',zones:['story:flugel-tundra-basin'],note:'古獣の氷原の西谷の仮背景'},
 driftingSnowField:{file:'drifting-snow-field-background-v1.png',decodedPreview:'drifting-snow-field-native-preview-v1.png',decodedTiers:'drifting-snow-field-native-tiers-v1.webp',zones:['story:drifting-snow-court'],note:'氷冠の雪庭の仮背景'},
 immortalConstructField:{file:'immortal-construct-field-background-v1.png',decodedPreview:'immortal-construct-field-native-preview-v1.png',decodedTiers:'immortal-construct-field-native-tiers-v1.webp',zones:['story:immortal-construct-root-hollow'],note:'赤葉の根洞の仮背景'},
 wavebinderField:{file:'wavebinder-field-background-v1.png',decodedPreview:'wavebinder-field-native-preview-v1.png',decodedTiers:'wavebinder-field-native-tiers-v1.webp',zones:['story:wavebinder-tide-cavern'],note:'西港の潮洞の仮背景'},
 dawnVein:{file:'dawn-vein-background-v1.png',decodedPreview:'dawn-vein-native-preview-v1.png',decodedTiers:'dawn-vein-native-tiers-v1.webp',zones:['story:dawn-vein-mine', 'story:dawn-vein-deep'],note:'星脈坑の仮背景'},
 dawnGlass:{file:'dawn-glass-background-v1.png',decodedPreview:'dawn-glass-native-preview-v1.png',decodedTiers:'dawn-glass-native-tiers-v1.webp',zones:['story:dawn-glass-ridge', 'story:dawn-glass-divide', 'story:dawn-crystal-field'],note:'暁晶尾根の仮背景'},
 ochkaCliff:{file:'ochka-cliff-background-v1.png',decodedPreview:'ochka-cliff-native-preview-v1.png',decodedTiers:'ochka-cliff-native-tiers-v1.webp',zones:['story:ochka-tide-stairs', 'story:ochka-patched-court'],note:'寄港地奥の仮背景'},
 ochkaKiln:{file:'ochka-kiln-background-v1.png',decodedPreview:'ochka-kiln-native-preview-v1.png',decodedTiers:'ochka-kiln-native-tiers-v1.webp',zones:['story:ochka-sifting-kiln'],note:'選鉱室の仮背景'},
 auroraGlass:{file:'aurora-glass-background-v1.png',decodedPreview:'aurora-glass-native-preview-v1.png',decodedTiers:'aurora-glass-native-tiers-v1.webp',zones:['story:aurora-ice-cut', 'story:aurora-ice-shelf'],note:'極光谷の仮背景'},
 thermalRavine:{file:'thermal-ravine-background-v1.png',decodedPreview:'thermal-ravine-native-preview-v1.png',decodedTiers:'thermal-ravine-native-tiers-v1.webp',zones:['story:aurora-steam-channel', 'story:aurora-mineral-terraces'],note:'湯気谷の仮背景'},
 coastalLookout:{file:'coastal-lookout-background-v1.png',decodedPreview:'coastal-lookout-native-preview-v1.png',decodedTiers:'coastal-lookout-native-tiers-v1.webp',zones:['story:dornman-wind-stairs', 'story:dornman-flag-trestle'],note:'港の高台と渡り廊下の仮背景'},
 windwardWorks:{file:'windward-works-background-v1.png',decodedPreview:'windward-works-native-preview-v1.png',decodedTiers:'windward-works-native-tiers-v1.webp',zones:['story:dornman-windworks'],note:'機関室の仮背景'},
 whitePassSnow:{file:'white-pass-wood-background-v1.png',decodedPreview:'white-pass-wood-native-preview-v1.png',decodedTiers:'white-pass-wood-native-tiers-v1.webp',zones:['story:winter-frontier-switchback', 'story:white-pass-cut', 'story:white-pass-woods', 'story:white-pass-ridge','story:sne-survey-yard'],note:'白虹峠へ続く雪道と観測広場の仮背景'},
 sneSurveyShed:{file:'sne-survey-shed-background-v1.png',decodedPreview:'sne-survey-shed-native-preview-v1.png',decodedTiers:'sne-survey-shed-native-tiers-v1.webp',zones:['story:sne-survey-shed'],note:'駅脇の観測小屋の仮背景'},
 sneSurveyRidge:{file:'sne-survey-ridge-background-v1.png',decodedPreview:'sne-survey-ridge-native-preview-v1.png',decodedTiers:'sne-survey-ridge-native-tiers-v1.webp',zones:['story:sne-survey-ridge','story:sne-survey-outskirts'],note:'観測路と雪棚の見晴らしの仮背景'},
 sneSnowMatch:{file:'sne-snow-match-background-v1.png',decodedPreview:'sne-snow-match-native-preview-v1.png',decodedTiers:'sne-snow-match-native-tiers-v1.webp',zones:['story:sne-snow-match'],note:'雪合戦広場の仮背景'},
 whitePassCoach:{file:'white-pass-coach-background-v1.png',decodedPreview:'white-pass-coach-native-preview-v1.png',decodedTiers:'white-pass-coach-native-tiers-v1.webp',zones:['story:white-pass-coach'],note:'列車内の仮背景'},
 whitePassStation:{file:'steam-stabling-depot-background-v1.png',decodedPreview:'steam-stabling-depot-native-preview-v1.png',decodedTiers:'steam-stabling-depot-native-tiers-v1.webp',zones:['story:white-pass-station'],note:'終着駅の共用仮背景'},
 whiteRainbowBasin:{file:'white-rainbow-background-v1.png',decodedPreview:'white-rainbow-native-preview-v1.png',decodedTiers:'white-rainbow-native-tiers-v1.webp',zones:['story:white-rainbow-basin'],note:'高原の仮背景'},
 snowRailTransfer:{file:'snow-rail-transfer-background-v1.png',decodedPreview:'snow-rail-transfer-native-preview-v1.png',decodedTiers:'snow-rail-transfer-native-tiers-v1.webp',zones:['story:snow-rail-transfer'],note:'雪線の積替場の仮背景'},
 steamStablingDepot:{file:'steam-stabling-depot-background-v1.png',decodedPreview:'steam-stabling-depot-native-preview-v1.png',decodedTiers:'steam-stabling-depot-native-tiers-v1.webp',zones:['story:steam-stabling-depot'],note:'蒸気留置庫の仮背景'},
 clothService:{file:'cloth-service-walk-background-v1.png',decodedPreview:'cloth-service-walk-native-preview-v1.png',decodedTiers:'cloth-service-walk-native-tiers-v1.webp',zones:['story:cloth-service-walk'],note:'作業路の仮背景'},
 threadlineRelay:{file:'threadline-relay-background-v1.png',decodedPreview:'threadline-relay-native-preview-v1.png',decodedTiers:'threadline-relay-native-tiers-v1.webp',zones:['story:threadline-relay'],note:'配電室の仮背景'},
 buriedWeaving:{file:'buried-weaving-background-v1.png',decodedPreview:'buried-weaving-native-preview-v1.png',decodedTiers:'buried-weaving-native-tiers-v1.webp',zones:['story:buried-weaving-room'],note:'織房の仮背景'},
 tideCalibration:{file:'tide-calibration-background-v1.png',decodedPreview:'tide-calibration-native-preview-v1.png',decodedTiers:'tide-calibration-native-tiers-v1.webp',zones:['story:tide-calibration-hall'],note:'潮位較正室の仮背景'},
 andriusWeekly:{file:'andrius-weekly-background-v1.png',decodedPreview:'andrius-weekly-native-preview-v1.png',decodedTiers:'andrius-weekly-native-tiers-v1.webp',surface:'stone',zones:['story:andrius-wolf-ring'],note:'奔狼領の試練場の仮背景'},
 dvalinWeekly:{file:'dvalin-weekly-background-v1.png',decodedPreview:'dvalin-weekly-native-preview-v1.png',decodedTiers:'dvalin-weekly-native-tiers-v1.webp',surface:'stone',zones:['story:dvalin-sky-arena'],note:'風龍の空域の仮背景'},
 generatorField:{file:'field-generator-field-background-v1.png',decodedPreview:'field-generator-field-native-preview-v1.png',decodedTiers:'field-generator-field-native-tiers-v1.webp',zones:['story:field-generator-field-chamber'],note:'重力試験室の仮背景'},
 seahorseField:{file:'seahorse-field-background-v1.png',decodedPreview:'seahorse-field-native-preview-v1.png',decodedTiers:'seahorse-field-native-tiers-v1.webp',zones:['story:seahorse-field-cavern'],note:'真珠珊瑚の洞の仮背景'},
 emperorField:{file:'emperor-field-background-v1.png',decodedPreview:'emperor-field-native-preview-v1.png',decodedTiers:'emperor-field-native-tiers-v1.webp',zones:['story:emperor-field-cove'],note:'熔殻の洞の仮背景'},
 baptistField:{file:'baptist-field-background-v1.png',decodedPreview:'baptist-field-native-preview-v1.png',decodedTiers:'baptist-field-native-tiers-v1.webp',zones:['story:baptist-field-sanctuary'],note:'三環の祭場の仮背景'},
 wenutField:{file:'wenut-field-background-v1.png',decodedPreview:'wenut-field-native-preview-v1.png',decodedTiers:'wenut-field-native-tiers-v1.webp',zones:['story:wenut-field-cavern'],note:'風蝕の砂洞の仮背景'},
 asimonField:{file:'asimon-field-background-v1.png',decodedPreview:'asimon-field-native-preview-v1.png',decodedTiers:'asimon-field-native-tiers-v1.webp',zones:['story:asimon-field-ruins'],note:'砂鏡の遺構の仮背景'},
 sneCentralIcewall:{file:'sne-central-icewall-background-v1.png',decodedPreview:'sne-central-icewall-native-preview-v1.png',decodedTiers:'sne-central-icewall-native-tiers-v1.webp',zones:['story:sites-hunt-100705'],note:'中央の氷壁回廊の仮背景'},
 sneWarriorShelf:{file:'sne-warrior-shelf-background-v1.png',decodedPreview:'sne-warrior-shelf-native-preview-v1.png',decodedTiers:'sne-warrior-shelf-native-tiers-v1.webp',zones:['story:sites-hunt-100705-pocket-1'],note:'氷壁の獣道の仮背景'},
 sneWestCutting:{file:'sne-west-cutting-background-v1.png',decodedPreview:'sne-west-cutting-native-preview-v1.png',decodedTiers:'sne-west-cutting-native-tiers-v1.webp',zones:['story:sites-hunt-100706'],note:'西の雪線の切通しの仮背景'},
 sneSnowboundShed:{file:'sne-snowbound-shed-background-v1.png',decodedPreview:'sne-snowbound-shed-native-preview-v1.png',decodedTiers:'sne-snowbound-shed-native-tiers-v1.webp',zones:['story:sites-hunt-100706-pocket-1'],note:'雪線の雪囲い跡の仮背景'},
 sneCityUnderpass:{file:'sne-underpass-background-v1.png',decodedPreview:'sne-underpass-native-preview-v1.png',decodedTiers:'sne-underpass-native-tiers-v1.webp',zones:['story:sites-hunt-100707'],note:'都南の白虹地下道の仮背景'},
 nodHiisiBridge:{file:'nod-hiisi-bridge-background-v1.png',decodedPreview:'nod-hiisi-bridge-native-preview-v1.png',decodedTiers:'nod-hiisi-bridge-native-tiers-v1.webp',zones:['story:sites-hunt-88121'],note:'ヒーシ島の渡り橋の仮背景'},
 nodReedDen:{file:'nod-reed-den-background-v1.png',decodedPreview:'nod-reed-den-native-preview-v1.png',decodedTiers:'nod-reed-den-native-tiers-v1.webp',zones:['story:sites-hunt-88121-pocket-1'],note:'ヒーシ島の葦の巣穴の仮背景'},
 nodLempoTerrace:{file:'nod-lempo-terrace-background-v1.png',decodedPreview:'nod-lempo-terrace-native-preview-v1.png',decodedTiers:'nod-lempo-terrace-native-tiers-v1.webp',zones:['story:sites-hunt-88122'],note:'レンポ島の工房を望む高台の仮背景'},
 nodFrostKiln:{file:'nod-frost-kiln-background-v1.png',decodedPreview:'nod-frost-kiln-native-preview-v1.png',decodedTiers:'nod-frost-kiln-native-tiers-v1.webp',zones:['story:sites-hunt-88122-pocket-1'],note:'霜夜の氷晶窟の仮背景'},
 nodPahaShore:{file:'nod-paha-shore-background-v1.png',decodedPreview:'nod-paha-shore-native-preview-v1.png',decodedTiers:'nod-paha-shore-native-tiers-v1.webp',zones:['story:sites-hunt-88123'],note:'パハ島の石浜の仮背景'},
 nodSurfHollow:{file:'nod-surf-hollow-background-v1.png',decodedPreview:'nod-surf-hollow-native-preview-v1.png',decodedTiers:'nod-surf-hollow-native-tiers-v1.webp',zones:['story:sites-hunt-88123-pocket-1'],note:'パハ島の潮穴の仮背景'},
 nodNorthPass:{file:'nod-north-pass-background-v1.png',decodedPreview:'nod-north-pass-native-preview-v1.png',decodedTiers:'nod-north-pass-native-tiers-v1.webp',zones:['story:sites-hunt-92859'],note:'北部高地の峠の仮背景'},
 nodWindShelter:{file:'nod-wind-shelter-background-v1.png',decodedPreview:'nod-wind-shelter-native-preview-v1.png',decodedTiers:'nod-wind-shelter-native-tiers-v1.webp',zones:['story:sites-hunt-92859-pocket-1'],note:'北部高地の風穴の仮背景'},
 nodFaultGate:{file:'nod-fault-gate-background-v1.png',decodedPreview:'nod-fault-gate-native-preview-v1.png',decodedTiers:'nod-fault-gate-native-tiers-v1.webp',zones:['story:sites-hunt-92860'],note:'北の断層の征討入口の仮背景'},
 liyueMingyunAdit:{file:'li-mingyun-adit-background-v1.png',decodedPreview:'li-mingyun-adit-native-preview-v1.png',decodedTiers:'li-mingyun-adit-native-tiers-v1.webp',zones:['story:sites-hunt-7173'],note:'明蘊の鉱山道の仮背景'},
 liyueStonehelmPit:{file:'li-stonehelm-pit-background-v1.png',decodedPreview:'li-stonehelm-pit-native-preview-v1.png',decodedTiers:'li-stonehelm-pit-native-tiers-v1.webp',zones:['story:sites-hunt-7173-pocket-1'],note:'岩兜の王の採石場の仮背景'},
 liyueGuiliRuins:{file:'li-guili-ruins-background-v1.png',decodedPreview:'li-guili-ruins-native-preview-v1.png',decodedTiers:'li-guili-ruins-native-tiers-v1.webp',zones:['story:sites-hunt-7190'],note:'帰離原の石道の仮背景'},
 liyueSentinelYard:{file:'li-sentinel-yard-background-v1.png',decodedPreview:'li-sentinel-yard-native-preview-v1.png',decodedTiers:'li-sentinel-yard-native-tiers-v1.webp',zones:['story:sites-hunt-7190-pocket-1'],note:'遺跡守衛の中庭の仮背景'},
 liyueGuyunShoal:{file:'li-guyun-shoal-background-v1.png',decodedPreview:'li-guyun-shoal-native-preview-v1.png',decodedTiers:'li-guyun-shoal-native-tiers-v1.webp',zones:['story:sites-hunt-7215','story:geo-approach','story:liyue-wp-100'],note:'孤雲閣の潮の岩棚の仮背景'},
 liyueEmberGrotto:{file:'li-ember-grotto-background-v1.png',decodedPreview:'li-ember-grotto-native-preview-v1.png',decodedTiers:'li-ember-grotto-native-tiers-v1.webp',zones:['story:sites-hunt-7215-pocket-1'],note:'孤雲閣の潮食洞の仮背景'},
 liyueGoldenApproach:{file:'li-golden-approach-background-v1.png',decodedPreview:'li-golden-approach-native-preview-v1.png',decodedTiers:'li-golden-approach-native-tiers-v1.webp',zones:['story:sites-hunt-7218'],note:'港南の黄金屋への道の仮背景'},
 liyueTianhengPass:{file:'li-tianheng-pass-background-v1.png',decodedPreview:'li-tianheng-pass-native-preview-v1.png',decodedTiers:'li-tianheng-pass-native-tiers-v1.webp',zones:['story:sites-hunt-7220','story:liyue-wp-92','story:liyue-wp-105','story:sites-corridor-liyue-switchback'],note:'天衡の山道の仮背景'},
 liyueCinderShrine:{file:'li-cinder-shrine-background-v1.png',decodedPreview:'li-cinder-shrine-native-preview-v1.png',decodedTiers:'li-cinder-shrine-native-tiers-v1.webp',zones:['story:sites-hunt-7220-pocket-1'],note:'天衡の石祠の仮背景'},
 liyueLuhuaTerraces:{file:'li-luhua-terraces-background-v1.png',decodedPreview:'li-luhua-terraces-native-preview-v1.png',decodedTiers:'li-luhua-terraces-native-tiers-v1.webp',zones:['story:sites-hunt-9778'],note:'漉華の段池の仮背景'},
 liyueDragonQueller:{file:'li-dragon-queller-background-v1.png',decodedPreview:'li-dragon-queller-native-preview-v1.png',decodedTiers:'li-dragon-queller-native-tiers-v1.webp',zones:['story:sites-hunt-18048'],note:'伏龍の古樹道の仮背景'},
 liyueRootSeal:{file:'li-root-seal-background-v1.png',decodedPreview:'li-root-seal-native-preview-v1.png',decodedTiers:'li-root-seal-native-tiers-v1.webp',zones:['story:sites-hunt-18048-pocket-1'],note:'伏龍の根元の封印室の仮背景'},
 liyueFungalHollow:{file:'li-fungal-hollow-background-v1.png',decodedPreview:'li-fungal-hollow-native-preview-v1.png',decodedTiers:'li-fungal-hollow-native-tiers-v1.webp',zones:['story:sites-hunt-18048-pocket-2'],note:'伏龍の木の菌床の仮背景'},
 liyueGoldenVault:{file:'li-golden-vault-background-v1.png',decodedPreview:'li-golden-vault-native-preview-v1.png',decodedTiers:'li-golden-vault-native-tiers-v1.webp',zones:['story:childe-golden-house-arena'],note:'黄金屋・公子の再現戦の仮背景'},
 liyueSealedCavern:{file:'li-sealed-cavern-background-v1.png',decodedPreview:'li-sealed-cavern-native-preview-v1.png',decodedTiers:'li-sealed-cavern-native-tiers-v1.webp',zones:['story:azhdaha-dragon-seal-arena'],note:'若陀龍王の封印洞の仮背景'},
 liyueAocangRidge:{file:'li-aocang-ridge-background-v1.png',decodedPreview:'li-aocang-ridge-native-preview-v1.png',decodedTiers:'li-aocang-ridge-native-tiers-v1.webp',zones:['story:sites-hunt-7114','story:liyue-wp-39','story:liyue-wp-40'],note:'奥蔵の北・山際の岩棚の仮背景'},
 liyueGeovishapDen:{file:'li-geovishap-den-background-v1.png',decodedPreview:'li-geovishap-den-native-preview-v1.png',decodedTiers:'li-geovishap-den-native-tiers-v1.webp',zones:['story:sites-hunt-7114-pocket-1','story:primo-approach'],note:'岩ヴィシャップの晶洞の仮背景'},
 liyueJueyunPool:{file:'li-jueyun-pool-background-v1.png',decodedPreview:'li-jueyun-pool-native-preview-v1.png',decodedTiers:'li-jueyun-pool-native-tiers-v1.webp',zones:['story:sites-hunt-7116','story:liyue-wp-42'],note:'絶雲の池畔・水鏡の段の仮背景'},
 liyueNorthLakeshore:{file:'li-north-lakeshore-background-v1.png',decodedPreview:'li-north-lakeshore-native-preview-v1.png',decodedTiers:'li-north-lakeshore-native-tiers-v1.webp',zones:['story:sites-hunt-7121','story:oceanid-approach','story:liyue-wp-1748'],note:'北の秘境・霧の湖岸の仮背景'},
 liyueFireaxeCamp:{file:'li-fireaxe-camp-background-v1.png',decodedPreview:'li-fireaxe-camp-native-preview-v1.png',decodedTiers:'li-fireaxe-camp-native-tiers-v1.webp',zones:['story:sites-hunt-7121-pocket-1'],note:'湖岸の脇部屋・炎斧の野営地の仮背景'},
 mondFrostRavine:{file:'mond-frost-ravine-background-v1.png',decodedPreview:'mond-frost-ravine-native-preview-v1.png',decodedTiers:'mond-frost-ravine-native-tiers-v1.webp',zones:['story:sites-hunt-7149'],note:'忘却の峡谷・霜の谷口の仮背景'},
 mondAgentHideout:{file:'mond-agent-hideout-background-v1.png',decodedPreview:'mond-agent-hideout-native-preview-v1.png',decodedTiers:'mond-agent-hideout-native-tiers-v1.webp',zones:['story:sites-hunt-7149-pocket-1'],note:'霜の谷・密偵の隠れ家の仮背景'},
 mondFalconTemple:{file:'mond-falcon-temple-background-v1.png',decodedPreview:'mond-falcon-temple-native-preview-v1.png',decodedTiers:'mond-falcon-temple-native-tiers-v1.webp',zones:['story:sites-hunt-7157'],note:'西風の鷹・風見の丘の仮背景'},
 mondLionTemple:{file:'mond-lion-temple-background-v1.png',decodedPreview:'mond-lion-temple-native-preview-v1.png',decodedTiers:'mond-lion-temple-native-tiers-v1.webp',zones:['story:sites-hunt-7186'],note:'南風の獅子・石門の谷の仮背景'},
 mondSummerCourt:{file:'mond-summer-court-background-v1.png',decodedPreview:'mond-summer-court-native-preview-v1.png',decodedTiers:'mond-summer-court-native-tiers-v1.webp',zones:['story:sites-hunt-7201'],note:'仲夏の庭園・花影の庭の仮背景'},
 mondWolfTemple:{file:'mond-wolf-temple-background-v1.png',decodedPreview:'mond-wolf-temple-native-preview-v1.png',decodedTiers:'mond-wolf-temple-native-tiers-v1.webp',zones:['story:sites-hunt-7206'],note:'北風の狼・北向きの石廊の仮背景'},
 mondFloodedAlcove:{file:'mond-flooded-alcove-background-v1.png',decodedPreview:'mond-flooded-alcove-native-preview-v1.png',decodedTiers:'mond-flooded-alcove-native-tiers-v1.webp',zones:['story:sites-hunt-7206-pocket-1'],note:'狼の神殿・水脈の石室の仮背景'},
 mondEagleCape:{file:'mond-eagle-cape-background-v1.png',decodedPreview:'mond-eagle-cape-native-preview-v1.png',decodedTiers:'mond-eagle-cape-native-tiers-v1.webp',zones:['story:sites-hunt-7210'],note:'鷹の門・海風の岬の仮背景'},
 mondWindBasin:{file:'mond-wind-basin-background-v1.png',decodedPreview:'mond-wind-basin-native-preview-v1.png',decodedTiers:'mond-wind-basin-native-tiers-v1.webp',zones:['story:sites-hunt-7210-pocket-1'],note:'岬・風の窪地の仮背景'},
 mondCeciliaGarden:{file:'mond-cecilia-garden-background-v1.png',decodedPreview:'mond-cecilia-garden-native-preview-v1.png',decodedTiers:'mond-cecilia-garden-native-tiers-v1.webp',zones:['story:sites-hunt-7092'],note:'セシリアの苗床・花の石段の仮背景'},
 mondRiftBurrow:{file:'mond-rift-burrow-background-v1.png',decodedPreview:'mond-rift-burrow-native-preview-v1.png',decodedTiers:'mond-rift-burrow-native-tiers-v1.webp',zones:['story:sites-hunt-7092-pocket-1'],note:'苗床・裂け目の獣穴の仮背景'},
 mondBrokenSpire:{file:'mond-broken-spire-background-v1.png',decodedPreview:'mond-broken-spire-native-preview-v1.png',decodedTiers:'mond-broken-spire-native-tiers-v1.webp',zones:['story:sites-hunt-7111'],note:'風龍廃墟・中央塔の回廊の仮背景'},
 mondShieldCamp:{file:'mond-shield-camp-background-v1.png',decodedPreview:'mond-shield-camp-native-preview-v1.png',decodedTiers:'mond-shield-camp-native-tiers-v1.webp',zones:['story:sites-hunt-7111-pocket-1'],note:'廃塔・木盾の野営地の仮背景'},
 mondQuietLookout:{file:'mond-quiet-lookout-background-v1.png',decodedPreview:'mond-quiet-lookout-native-preview-v1.png',decodedTiers:'mond-quiet-lookout-native-tiers-v1.webp',zones:['story:sites-hunt-7111-pocket-2'],note:'廃塔・風待ちの見晴らし台の仮背景'},
 mondMemoryValley:{file:'mond-memory-valley-background-v1.png',decodedPreview:'mond-memory-valley-native-preview-v1.png',decodedTiers:'mond-memory-valley-native-tiers-v1.webp',zones:['story:sites-hunt-7137'],note:'銘記の谷・谷の小径の仮背景'},
 mondLogHollow:{file:'mond-log-hollow-background-v1.png',decodedPreview:'mond-log-hollow-native-preview-v1.png',decodedTiers:'mond-log-hollow-native-tiers-v1.webp',zones:['story:sites-hunt-7137-pocket-1'],note:'谷・くり抜かれた倒木の仮背景'},
 inaSuigetsuPool:{file:'ina-suigetsu-pool-background-v1.png',decodedPreview:'ina-suigetsu-pool-native-preview-v1.png',decodedTiers:'ina-suigetsu-pool-native-tiers-v1.webp',zones:['story:sites-hunt-15949','story:watatsumi-landing','story:ina-wp-15940','story:ina-wp-15951'],note:'池の中の秘境・水月池の石井戸の仮背景'},
 inaCastleKeep:{file:'ina-castle-keep-background-v1.png',decodedPreview:'ina-castle-keep-native-preview-v1.png',decodedTiers:'ina-castle-keep-native-tiers-v1.webp',zones:['story:sites-hunt-17223'],note:'稲妻城・御殿の外廊の仮背景'},
 inaFogIslet:{file:'ina-fog-islet-background-v1.png',decodedPreview:'ina-fog-islet-native-preview-v1.png',decodedTiers:'ina-fog-islet-native-tiers-v1.webp',zones:['story:sites-hunt-18667','story:tsurumi-coast'],note:'離れ小島・霧の岸の仮背景'},
 inaTideChamber:{file:'ina-tide-chamber-background-v1.png',decodedPreview:'ina-tide-chamber-native-preview-v1.png',decodedTiers:'ina-tide-chamber-native-tiers-v1.webp',zones:['story:sites-hunt-18667-pocket-1'],note:'離れ小島・潮の石室の仮背景'},
 inaSeiraiCrags:{file:'ina-seirai-crags-background-v1.png',decodedPreview:'ina-seirai-crags-native-preview-v1.png',decodedTiers:'ina-seirai-crags-native-tiers-v1.webp',zones:['story:sites-hunt-20369','story:thunder-approach','story:ina-wp-16022','story:ina-wp-16026','story:ina-wp-16029'],note:'セイライ・雷雲の岩場の仮背景'},
 inaSacredRoots:{file:'ina-sacred-roots-background-v1.png',decodedPreview:'ina-sacred-roots-native-preview-v1.png',decodedTiers:'ina-sacred-roots-native-tiers-v1.webp',zones:['story:sites-hunt-24906'],note:'鳴神・神櫻の根道の仮背景'},
 inaMirrorSanctum:{file:'ina-mirror-sanctum-background-v1.png',decodedPreview:'ina-mirror-sanctum-native-preview-v1.png',decodedTiers:'ina-mirror-sanctum-native-tiers-v1.webp',zones:['story:sites-hunt-24906-pocket-1'],note:'鳴神・鏡の控え間の仮背景'},
 inaTataraFurnace:{file:'ina-tatara-furnace-background-v1.png',decodedPreview:'ina-tatara-furnace-native-preview-v1.png',decodedTiers:'ina-tatara-furnace-native-tiers-v1.webp',zones:['story:sites-hunt-12788','story:ina-wp-12715','story:ina-wp-12718'],note:'たたら砂の炉沿いの作業路の仮背景'},
 inaMirrorGallery:{file:'ina-tatara-mirror-background-v1.png',decodedPreview:'ina-tatara-mirror-native-preview-v1.png',decodedTiers:'ina-tatara-mirror-native-tiers-v1.webp',zones:['story:sites-hunt-12788-pocket-1'],note:'ミラーメイデンの水鏡室の仮背景'},
 inaYashioriRift:{file:'ina-yashiori-rift-background-v1.png',decodedPreview:'ina-yashiori-rift-native-preview-v1.png',decodedTiers:'ina-yashiori-rift-native-tiers-v1.webp',zones:['story:sites-hunt-12791','story:ina-wp-12749','story:ina-wp-12704'],note:'ヤシオリの雷裂きの谷の仮背景'},
 inaRiftMachineBay:{file:'ina-yashiori-machine-background-v1.png',decodedPreview:'ina-yashiori-machine-native-preview-v1.png',decodedTiers:'ina-yashiori-machine-native-tiers-v1.webp',zones:['story:sites-hunt-12791-pocket-1'],note:'遺跡殲滅者の岩盤格納室の仮背景'},
 inaRiftBoneDen:{file:'ina-yashiori-den-background-v1.png',decodedPreview:'ina-yashiori-den-native-preview-v1.png',decodedTiers:'ina-yashiori-den-native-tiers-v1.webp',zones:['story:sites-hunt-12791-pocket-2'],note:'聖骸獣の骨のねぐらの仮背景'},
 inaSerpentQuarry:{file:'ina-serpent-quarry-background-v1.png',decodedPreview:'ina-serpent-quarry-native-preview-v1.png',decodedTiers:'ina-serpent-quarry-native-tiers-v1.webp',zones:['story:sites-hunt-12794','story:maguu-approach'],note:'蛇骨鉱坑の岩棚の仮背景'},
 inaAraumiCistern:{file:'ina-araumi-cistern-background-v1.png',decodedPreview:'ina-araumi-cistern-native-preview-v1.png',decodedTiers:'ina-araumi-cistern-native-tiers-v1.webp',zones:['story:sites-hunt-12778'],note:'荒海地下の排水廊の仮背景'},
 inaThunderVault:{file:'ina-thunder-vault-background-v1.png',decodedPreview:'ina-thunder-vault-native-preview-v1.png',decodedTiers:'ina-thunder-vault-native-tiers-v1.webp',zones:['story:sites-hunt-12778-pocket-1'],note:'雷兜の王の石室の仮背景'},
 inaYougouStair:{file:'ina-yougou-stair-background-v1.png',decodedPreview:'ina-yougou-stair-native-preview-v1.png',decodedTiers:'ina-yougou-stair-native-tiers-v1.webp',zones:['story:sites-hunt-12781','story:ina-wp-12733','story:ina-wp-12738'],note:'影向山の杉の参道の仮背景'},
 inaRuinWorkshop:{file:'ina-ruin-workshop-background-v1.png',decodedPreview:'ina-ruin-workshop-native-preview-v1.png',decodedTiers:'ina-ruin-workshop-native-tiers-v1.webp',zones:['story:sites-hunt-12781-pocket-1'],note:'遺跡殲滅者の地下格納室の仮背景'},
 inaByakkoMeadow:{file:'ina-byakko-meadow-background-v1.png',decodedPreview:'ina-byakko-meadow-native-preview-v1.png',decodedTiers:'ina-byakko-meadow-native-tiers-v1.webp',zones:['story:sites-hunt-12784','story:ina-wp-12728'],note:'白狐の野の分かれ道の仮背景'},
 inaThunderaxeCamp:{file:'ina-thunderaxe-camp-background-v1.png',decodedPreview:'ina-thunderaxe-camp-native-preview-v1.png',decodedTiers:'ina-thunderaxe-camp-native-tiers-v1.webp',zones:['story:sites-hunt-12784-pocket-1'],note:'雷斧の暴徒の野営地の仮背景'},
 natEastRiver:{file:'natlan-riverside-trial-background-v1.png',decodedPreview:'natlan-riverside-trial-native-preview-v1.png',decodedTiers:'natlan-riverside-trial-native-tiers-v1.webp',zones:['story:sites-hunt-73159'],note:'東の川沿いの段丘の仮背景'},
 natWestKeysTrail:{file:'nat-kachina-charms-trail-background-v1.png',decodedPreview:'nat-kachina-charms-trail-native-preview-v1.png',decodedTiers:'nat-kachina-charms-trail-native-tiers-v1.webp',zones:['story:sites-hunt-73160'],note:'源泉北の彩石の道の仮背景'},
 natNorthCliff:{file:'natlan-race-ridge-background-v1.png',decodedPreview:'natlan-race-ridge-native-preview-v1.png',decodedTiers:'natlan-race-ridge-native-tiers-v1.webp',zones:['story:sites-hunt-81383'],note:'クァワカン南の断崖の仮背景'},
 natVolcanicShore:{file:'nat-mualani-surf-cove-background-v1.png',decodedPreview:'nat-mualani-surf-cove-native-preview-v1.png',decodedTiers:'nat-mualani-surf-cove-native-tiers-v1.webp',zones:['story:sites-hunt-82577'],note:'アトクパンの海辺の仮背景'},
 natCentralPath:{file:'ochka-cliff-background-v1.png',decodedPreview:'ochka-cliff-native-preview-v1.png',decodedTiers:'ochka-cliff-native-tiers-v1.webp',zones:['story:sites-hunt-73161'],note:'中央の岩壁の細道の仮背景'},
 natFallsCavern:{file:'nat-falls-cavern-background-v1.png',decodedPreview:'nat-falls-cavern-native-preview-v1.png',decodedTiers:'nat-falls-cavern-native-tiers-v1.webp',zones:['story:tepeacac-waterfall-wall'],note:'滝裏の燃素洞の仮背景'},
 natErodedKiln:{file:'nat-eroded-kiln-background-v1.png',decodedPreview:'nat-eroded-kiln-native-preview-v1.png',decodedTiers:'nat-eroded-kiln-native-tiers-v1.webp',zones:['story:sites-hunt-73159-pocket-1'],note:'蝕土者の焼けた岩室の仮背景'},
 natCicinCamp:{file:'nat-cicin-camp-background-v1.png',decodedPreview:'nat-cicin-camp-native-preview-v1.png',decodedTiers:'nat-cicin-camp-native-tiers-v1.webp',zones:['story:sites-hunt-73159-pocket-2'],note:'蛍術師の観測野営地の仮背景'},
 natSpringKeyCave:{file:'nat-spring-key-background-v1.png',decodedPreview:'nat-spring-key-native-preview-v1.png',decodedTiers:'nat-spring-key-native-tiers-v1.webp',zones:['story:toyac-rainbow-key-cave'],note:'二つの鍵の洞窟の仮背景'},
 natSpiritAlcove:{file:'nat-spirit-alcove-background-v1.png',decodedPreview:'nat-spirit-alcove-native-preview-v1.png',decodedTiers:'nat-spirit-alcove-native-tiers-v1.webp',zones:['story:sites-hunt-73161-pocket-1'],note:'大霊の化身の祭壇の仮背景'},
 natRangerShelter:{file:'nat-ranger-shelter-background-v1.png',decodedPreview:'nat-ranger-shelter-native-preview-v1.png',decodedTiers:'nat-ranger-shelter-native-tiers-v1.webp',zones:['story:sites-hunt-81383-pocket-1'],note:'断崖下のレンジャーの寝床の仮背景'},
 natSouthernClearing:{file:'nat-southern-clearing-background-v1.png',decodedPreview:'nat-southern-clearing-native-preview-v1.png',decodedTiers:'nat-southern-clearing-native-tiers-v1.webp',zones:['story:atocpan-domain-side-clearing'],note:'火山南の秘境脇の草地の仮背景'},
 sumFungalGrove:{file:'sum-grove-background-v1.png',decodedPreview:'sum-grove-native-preview-v1.png',decodedTiers:'sum-grove-native-tiers-v1.webp',zones:['story:sites-hunt-28751'],note:'茸林の傘茸群生地の仮背景'},
 sumSporeHollow:{file:'sum-spore-background-v1.png',decodedPreview:'sum-spore-native-preview-v1.png',decodedTiers:'sum-spore-native-tiers-v1.webp',zones:['story:sites-hunt-28751-pocket-1'],note:'炎の魔術師の菌床洞の仮背景'},
 sumFieldStation:{file:'sum-station-background-v1.png',decodedPreview:'sum-station-native-preview-v1.png',decodedTiers:'sum-station-native-tiers-v1.webp',zones:['story:sites-hunt-28754'],note:'雨林の観測小屋の仮背景'},
 sumServiceBay:{file:'sum-service-background-v1.png',decodedPreview:'sum-service-native-preview-v1.png',decodedTiers:'sum-service-native-tiers-v1.webp',zones:['story:sites-hunt-28754-pocket-1'],note:'遺跡機兵の整備室の仮背景'},
 sumMossGate:{file:'sum-mossgate-background-v1.png',decodedPreview:'sum-mossgate-native-preview-v1.png',decodedTiers:'sum-mossgate-native-tiers-v1.webp',zones:['story:sites-hunt-28755'],note:'山腹の苔むした遺跡門の仮背景'},
 sumSentinelCourt:{file:'sum-court-background-v1.png',decodedPreview:'sum-court-native-preview-v1.png',decodedTiers:'sum-court-native-tiers-v1.webp',zones:['story:sites-hunt-28755-pocket-1'],note:'遺跡守衛の石庭の仮背景'},
 sumFernRavine:{file:'sum-ravine-background-v1.png',decodedPreview:'sum-ravine-native-preview-v1.png',decodedTiers:'sum-ravine-native-tiers-v1.webp',zones:['story:sites-hunt-28757'],note:'南西のシダの谷の仮背景'},
 sumCanopyHangar:{file:'sum-aviary-background-v1.png',decodedPreview:'sum-aviary-native-preview-v1.png',decodedTiers:'sum-aviary-native-tiers-v1.webp',zones:['story:sites-hunt-28757-pocket-1'],note:'飛空ドレイクの樹冠格納庫の仮背景'},
 sumRedSandWell:{file:'sum-redsand-well-background-v1.png',decodedPreview:'sum-redsand-well-native-preview-v1.png',decodedTiers:'sum-redsand-well-native-tiers-v1.webp',zones:['story:sites-hunt-36703'],note:'赤砂の井戸下回廊の仮背景'},
 sumRedSandRoost:{file:'sum-redsand-roost-background-v1.png',decodedPreview:'sum-redsand-roost-native-preview-v1.png',decodedTiers:'sum-redsand-roost-native-tiers-v1.webp',zones:['story:sites-hunt-36703-pocket-1'],note:'飛空ドレイクの格納室の仮背景'},
 sumRoyalDen:{file:'sum-royal-den-background-v1.png',decodedPreview:'sum-royal-den-native-preview-v1.png',decodedTiers:'sum-royal-den-native-tiers-v1.webp',zones:['story:sites-hunt-36704-pocket-1'],note:'王墓脇の岩棚の仮背景'},
 sumDuneVault:{file:'sum-dune-vault-background-v1.png',decodedPreview:'sum-dune-vault-native-preview-v1.png',decodedTiers:'sum-dune-vault-native-tiers-v1.webp',zones:['story:sites-hunt-36705'],note:'砂丘の埋没回廊の仮背景'},
 sumDuneCounterweight:{file:'sum-dune-counterweight-background-v1.png',decodedPreview:'sum-dune-counterweight-native-preview-v1.png',decodedTiers:'sum-dune-counterweight-native-tiers-v1.webp',zones:['story:sites-hunt-36705-pocket-1'],note:'埋没した重力装置室の仮背景'},
 sumSandMarket:{file:'sum-sands-market-background-v1.png',decodedPreview:'sum-sands-market-native-preview-v1.png',decodedTiers:'sum-sands-market-native-tiers-v1.webp',zones:['story:sites-hunt-41694'],note:'市場跡の石段の仮背景'},
 sumSandBalances:{file:'sum-sands-balance-background-v1.png',decodedPreview:'sum-sands-balance-native-preview-v1.png',decodedTiers:'sum-sands-balance-native-tiers-v1.webp',zones:['story:sites-hunt-41694-pocket-1'],note:'市場裏の天秤室の仮背景'},
 sumSandWindcut:{file:'sum-sands-windcut-background-v1.png',decodedPreview:'sum-sands-windcut-native-preview-v1.png',decodedTiers:'sum-sands-windcut-native-tiers-v1.webp',zones:['story:sites-hunt-41817'],note:'千尋北の風穴の仮背景'},
 sumSandSentry:{file:'sum-sands-sentry-background-v1.png',decodedPreview:'sum-sands-sentry-native-preview-v1.png',decodedTiers:'sum-sands-sentry-native-tiers-v1.webp',zones:['story:sites-hunt-41817-pocket-1'],note:'風穴奥の守衛詰所の仮背景'},
 sumSandEastBasin:{file:'sum-sands-basin-background-v1.png',decodedPreview:'sum-sands-basin-native-preview-v1.png',decodedTiers:'sum-sands-basin-native-tiers-v1.webp',zones:['story:sites-hunt-41818'],note:'千尋東の外輪盆地の仮背景'},
 sumeruDesertTombApproach:{file:'sumeru-desert-tomb-approach-background-v1.png',decodedPreview:'sumeru-desert-tomb-approach-native-preview-v1.png',decodedTiers:'sumeru-desert-tomb-approach-native-tiers-v1.webp',zones:['story:sites-hunt-36704'],note:'砂丘と王墓を望む参道のラボ用仮背景'},
 dendroHypostasisField:{file:'dendro-hypostasis-field-background-v1.png',decodedPreview:'dendro-hypostasis-field-native-preview-v1.png',decodedTiers:'dendro-hypostasis-field-native-tiers-v1.webp',zones:['story:dendro-hypostasis-field-den'],note:'枯蔓の洞の仮背景'},
 aeonblightField:{file:'aeonblight-field-background-v1.png',decodedPreview:'aeonblight-field-native-preview-v1.png',decodedTiers:'aeonblight-field-native-tiers-v1.webp',zones:['story:aeonblight-field-chamber'],note:'機翼の間の仮背景'},
 electroVineField:{file:'electro-regisvine-field-background-v1.png',decodedPreview:'electro-regisvine-field-native-preview-v1.png',decodedTiers:'electro-regisvine-field-native-tiers-v1.webp',zones:['story:electro-regisvine-field-cave'],note:'紫脈の石窟の仮背景'},
 bathysmalField:{file:'bathysmal-field-background-v1.png',decodedPreview:'bathysmal-field-native-preview-v1.png',decodedTiers:'bathysmal-field-native-tiers-v1.webp',zones:['story:bathysmal-field-sanctum'],note:'双影の石庭の仮背景'},
 ruinSerpentField:{file:'ruin-serpent-field-background-v1.png',decodedPreview:'ruin-serpent-field-native-preview-v1.png',decodedTiers:'ruin-serpent-field-native-tiers-v1.webp',zones:['story:ruin-serpent-field-pit'],note:'巨蛇岩穴の掘削場の仮背景'},
 wolflordField:{file:'wolflord-field-background-v1.png',decodedPreview:'wolflord-field-native-preview-v1.png',decodedTiers:'wolflord-field-native-tiers-v1.webp',zones:['story:wolflord-field-ruins'],note:'鶴観の霧浜遺跡の仮背景'},
 hydroHypostasisField:{file:'hydro-hypostasis-field-background-v1.png',decodedPreview:'hydro-hypostasis-field-native-preview-v1.png',decodedTiers:'hydro-hypostasis-field-native-tiers-v1.webp',zones:['story:hydro-hypostasis-field-cove'],note:'潮紋の洞の仮背景'},
 pyroHypostasisField:{file:'pyro-hypostasis-field-background-v1.png',decodedPreview:'pyro-hypostasis-field-native-preview-v1.png',decodedTiers:'pyro-hypostasis-field-native-tiers-v1.webp',zones:['story:pyro-hypostasis-field-terrace'],note:'燎火の石浜の仮背景'},
 cryoHypostasisField:{file:'cryo-hypostasis-field-background-v1.png',decodedPreview:'cryo-hypostasis-field-native-preview-v1.png',decodedTiers:'cryo-hypostasis-field-native-tiers-v1.webp',zones:['story:cryo-hypostasis-field-basin'],note:'霜輪の窪地の仮背景'},
 thunderField:{file:'thunder-field-background-v1.png',decodedPreview:'thunder-field-native-preview-v1.png',decodedTiers:'thunder-field-native-tiers-v1.webp',zones:['story:thunder-field-crest'],note:'雷鳴の岩峰の仮背景'},
 arrayField:{file:'array-field-background-v1.png',decodedPreview:'array-field-native-preview-v1.png',decodedTiers:'array-field-native-tiers-v1.webp',zones:['story:array-field-court'],note:'機巧の石庭の仮背景'},
 maguuField:{file:'maguu-field-background-v1.png',decodedPreview:'maguu-field-native-preview-v1.png',decodedTiers:'maguu-field-native-tiers-v1.webp',zones:['story:maguu-field-dojo'],note:'剣鬼の古庭の仮背景'},
 oceanidField:{file:'oceanid-field-background-v1.png',decodedPreview:'oceanid-field-native-preview-v1.png',decodedTiers:'oceanid-field-native-tiers-v1.webp',zones:['story:oceanid-field-reservoir'],note:'軽策の水鏡の仮背景'},
 primoField:{file:'primo-geovishap-field-background-v1.png',decodedPreview:'primo-geovishap-field-native-preview-v1.png',decodedTiers:'primo-geovishap-field-native-tiers-v1.webp',zones:['story:primo-field-vault'],note:'伏竜の石窟の仮背景'},
 geoField:{file:'geo-hypostasis-field-background-v1.png',decodedPreview:'geo-hypostasis-field-native-preview-v1.png',decodedTiers:'geo-hypostasis-field-native-tiers-v1.webp',zones:['story:geo-field-court'],note:'層石の円庭の仮背景'},
 pyroField:{file:'pyro-regisvine-field-background-v1.png',decodedPreview:'pyro-regisvine-field-native-preview-v1.png',decodedTiers:'pyro-regisvine-field-native-tiers-v1.webp',zones:['story:pyro-field-grotto'],note:'燠火の岩窟の仮背景'},
 electroField:{file:'electro-hypostasis-field-background-v1.png',decodedPreview:'electro-hypostasis-field-native-preview-v1.png',decodedTiers:'electro-hypostasis-field-native-tiers-v1.webp',zones:['story:electro-field-shelf'],note:'雷紋の岩棚の仮背景'},
 cryoField:{file:'cryo-regisvine-field-background-v1.png',decodedPreview:'cryo-regisvine-field-native-preview-v1.png',decodedTiers:'cryo-regisvine-field-native-tiers-v1.webp',zones:['story:cryo-field-grove'],note:'霜花の洞窟の仮背景'},
 mondroof:{file:'mond-rooftops-background-v1.png',decodedPreview:'mond-rooftops-native-preview-v1.png',decodedTiers:'mond-rooftops-native-tiers-v1.webp',zones:['story:mond-roof-route'],note:'赤い屋根と風車を見上げる仮背景'},
 mondlookout:{file:'mond-windmill-lookout-background-v1.png',decodedPreview:'mond-windmill-lookout-native-preview-v1.png',decodedTiers:'mond-windmill-lookout-native-tiers-v1.webp',zones:['story:mond-windmill-lookout'],note:'城門・草地・丘を見渡す仮背景'},
 windsplit:{file:'mond-windsplit-cave-background-v1.png',decodedPreview:'mond-windsplit-cave-native-preview-v1.png',decodedTiers:'mond-windsplit-cave-native-tiers-v1.webp',zones:['story:mond-bennett-ledge','story:mond-bennett-depth'],note:'風で入口が開いた石灰洞窟の仮背景'},
 mondrest:{file:'mond-roadside-rest-background-v1.png',decodedPreview:'mond-roadside-rest-native-preview-v1.png',decodedTiers:'mond-roadside-rest-native-tiers-v1.webp',zones:['story:mond-roadside-rest'],note:'木陰と街道を描いた休憩所の仮背景'},
 mondOrchard:{file:'mond-return-box-background-v1.png',decodedPreview:'mond-return-box-native-preview-v1.png',decodedTiers:'mond-return-box-native-tiers-v1.webp',zones:['story:mond-library-orchard'],note:'図書館裏の果樹道の仮背景'},
 mondNightHill:{file:'mond-night-banner-background-v1.png',decodedPreview:'mond-night-banner-native-preview-v1.png',decodedTiers:'mond-night-banner-native-tiers-v1.webp',zones:['story:mond-night-hill'],note:'月影の風見丘の仮背景'},
 inazumatown:{file:'inazuma-castle-town-background-v1.png',decodedPreview:'inazuma-castle-town-native-preview-v1.png',decodedTiers:'inazuma-castle-town-native-tiers-v1.webp',zones:['story:inazuma-town'],note:'桜並木と港の夕方を描いた城下の仮背景'},
 seacave:{file:'inazuma-sea-cave-background-v1.png',decodedPreview:'inazuma-sea-cave-native-preview-v1.png',decodedTiers:'inazuma-sea-cave-native-tiers-v1.webp',zones:['story:inazuma-sea-cave'],note:'洞穴から夕暮れの海が見えるラボ仮背景'},
 shiomicape:{file:'inazuma-shiomi-cape-background-v1.png',decodedPreview:'inazuma-shiomi-cape-native-preview-v1.png',decodedTiers:'inazuma-shiomi-cape-native-tiers-v1.webp',zones:['story:inazuma-shiomi-cape','story:inazuma-shore-hunt'],note:'潮見の岬と潮風の浜に使う海辺のラボ仮背景'},
 fireworkLookouts:{file:'ina-fireworks-lookouts-background-v1.png',decodedPreview:'ina-fireworks-lookouts-native-preview-v1.png',decodedTiers:'ina-fireworks-lookouts-native-tiers-v1.webp',zones:['story:ina-firework-lookouts'],note:'三つの見晴らしの仮背景'},
 fireworkBeach:{file:'ina-fireworks-beach-background-v1.png',decodedPreview:'ina-fireworks-beach-native-preview-v1.png',decodedTiers:'ina-fireworks-beach-native-tiers-v1.webp',zones:['story:ina-firework-beach'],note:'家の窓から見える花火浜の仮背景'},
 sayuWatchpath:{file:'ina-sayu-route-background-v1.png',decodedPreview:'ina-sayu-route-native-preview-v1.png',decodedTiers:'ina-sayu-route-native-tiers-v1.webp',zones:['story:ina-sayu-watchpath'],note:'木陰の巡回路の仮背景'},
 ittoFestival:{file:'ina-itto-games-background-v1.png',decodedPreview:'ina-itto-games-native-preview-v1.png',decodedTiers:'ina-itto-games-native-tiers-v1.webp',zones:['story:ina-festival-games'],note:'三番勝負の競技広場の仮背景'},
 teaCrossroads:{file:'ina-tea-case-crossroads-background-v1.png',decodedPreview:'ina-tea-case-crossroads-native-preview-v1.png',decodedTiers:'ina-tea-case-crossroads-native-tiers-v1.webp',zones:['story:ina-tea-crossroads'],note:'昼の木陰の分かれ道の仮背景'},
 teaLanding:{file:'ina-tea-case-landing-background-v1.png',decodedPreview:'ina-tea-case-landing-native-preview-v1.png',decodedTiers:'ina-tea-case-landing-native-tiers-v1.webp',zones:['story:ina-tea-landing','story:ina-wp-12722','story:ina-wp-13669','story:ina-wp-13670'],note:'夕方の船着き場の仮背景'},
 toriiforest:{file:'inazuma-torii-forest-background-v1.png',decodedPreview:'inazuma-torii-forest-native-preview-v1.png',decodedTiers:'inazuma-torii-forest-native-tiers-v1.webp',zones:['story:inazuma-torii-footprints','story:inazuma-torii-statues','story:inazuma-torii-reflections','story:inazuma-torii-thicket'],note:'鎮守の森の色と鳥居を参照した共通の仮背景'},
 liyuequarry:{file:'liyue-quarry-background-v1.png',decodedPreview:'liyue-quarry-native-preview-v1.png',decodedTiers:'liyue-quarry-native-tiers-v1.webp',zones:['story:liyue-river-trail','story:liyue-cliff-planks','story:liyue-quarry-post','story:liyue-quarry-storage','story:liyue-book-camp'],note:'川沿い・桟道・石切り場・宝盗団の拠点で共用する仮背景'},
 mondrestored:{file:'mond-restored-road-background-v1.png',decodedPreview:'mond-restored-road-native-preview-v1.png',decodedTiers:'mond-restored-road-native-tiers-v1.webp',zones:['story:mond-restored-road'],clearedZones:['story:mond-watchtower'],note:'見張り討伐後の街道の仮画像'},
 mondhill:{file:'mond-hill-background-v1.png',decodedPreview:'mond-hill-native-preview-v1.png',decodedTiers:'mond-hill-native-tiers-v1.webp',region:null,zones:['story:mond-hill','story:mond-watchtower','story:anemo-field-basin'],note:'見張り台と赤い旗の試作構図'},
 chasm:{file:'chasm-background-v1.png',decodedPreview:'chasm-native-preview-v1.png',decodedTiers:'chasm-native-tiers-v1.webp',region:'層岩巨淵・地下鉱区',zones:[,'story:sites-corridor-chasm-border'],note:'岩層や青い光を参照したラボ仮背景（坑道と足場は試作）'},
 wingspan:{file:'wingspan-background-v1.png',decodedPreview:'wingspan-native-preview-v1.png',decodedTiers:'wingspan-native-tiers-v1.webp',region:'翼の峰',zones:[],note:'巨龍の公式紹介を参照したラボ仮背景（地形・入口は試作）'},
 novokichev:{file:'novokichev-background-v1.png',decodedPreview:'novokichev-native-preview-v1.png',decodedTiers:'novokichev-native-tiers-v1.webp',region:'ノヴォキッチェヴ（仮構造）',zones:[],note:'地下探索路の仮画像（市街地・最深部の採用未確定）'},
 nodspecial:{file:'nodspecial-background-v1.png',decodedPreview:'nodspecial-native-preview-v1.png',decodedTiers:'nodspecial-native-tiers-v1.webp',region:'ナド・クライ特別地域（仮）',zones:[],note:'場所・構造未確定の独自案（月明かりの湖畔）'},
 dornman:{file:'dornman-background-v1.png',decodedPreview:'dornman-native-preview-v1.png',decodedTiers:'dornman-native-tiers-v1.webp',region:'ドーンマンポート',zones:[]},
 paperValley:{file:'paper-valley-background-v1.png',decodedPreview:'paper-valley-native-preview-v1.png',decodedTiers:'paper-valley-native-tiers-v1.webp',zones:['story:simulanka-fold-valley','story:simulanka-lantern-perch']},
 simulanka:{file:'simulanka-background-v1.png',decodedPreview:'simulanka-native-preview-v1.png',decodedTiers:'simulanka-native-tiers-v1.webp',region:'シムランカ',zones:[]},
 mirageTrack:{file:'mirage-track-background-v1.png',decodedPreview:'mirage-track-native-preview-v1.png',decodedTiers:'mirage-track-native-tiers-v1.webp',zones:['story:veluriyam-trolley-out','story:veluriyam-trolley-back','story:veluriyam-petal-stop','story:veluriyam-rail-end','story:veluriyam-petal-lookout']},
 veluriyam:{file:'veluriyam-background-v1.png',decodedPreview:'veluriyam-native-preview-v1.png',decodedTiers:'veluriyam-native-tiers-v1.webp',region:'ヴェルーリヤ・ミラージュ',zones:[]},
 goldenDock:{file:'golden-dock-background-v1.png',decodedPreview:'golden-dock-native-preview-v1.png',decodedTiers:'golden-dock-native-tiers-v1.webp',zones:['story:golden-mainland-coast'],note:'小舟の桟橋の仮背景'},
 goldenGrotto:{file:'golden-grotto-background-v1.png',decodedPreview:'golden-grotto-native-preview-v1.png',decodedTiers:'golden-grotto-native-tiers-v1.webp',zones:['story:golden-shadow-grotto','story:golden-tide-pocket'],note:'小洞窟と小浜の仮背景'},
 golden:{file:'golden-background-v1.png',decodedPreview:'golden-native-preview-v1.png',decodedTiers:'golden-native-tiers-v1.webp',region:'金リンゴ群島',zones:[]},
 tunigiExcavation:{file:'tunigi-excavation-background-v1.png',decodedPreview:'tunigi-excavation-native-preview-v1.png',decodedTiers:'tunigi-excavation-native-tiers-v1.webp',zones:['story:tunigi-vent-shelf','story:tunigi-baffle-workshop','story:tunigi-elite-passage','story:tunigi-fragment-vault','story:tunigi-return-shelter']},
 tunigi:{file:'tunigi-background-v1.png',decodedPreview:'tunigi-native-preview-v1.png',decodedTiers:'tunigi-native-tiers-v1.webp',region:'トゥニギの黒淵',zones:[]},
 ochkanatlan:{file:'ochkanatlan-background-v1.png',decodedPreview:'ochkanatlan-native-preview-v1.png',decodedTiers:'ochkanatlan-native-tiers-v1.webp',region:'オシカ・ナタ',zones:[]},
 bygoneResonance:{file:'bygone-resonance-background-v1.png',decodedPreview:'bygone-resonance-native-preview-v1.png',decodedTiers:'bygone-resonance-native-tiers-v1.webp',measurementNode:'bygone-bell-archive',zones:['story:bygone-resonance-chamber','story:bygone-inscribed-hall','story:bygone-listening-gallery'],note:'共鳴石と記録室の仮背景'},
 bygone:{file:'bygone-background-v1.png',decodedPreview:'bygone-native-preview-v1.png',decodedTiers:'bygone-native-tiers-v1.webp',region:'往日の海',zones:[]},
 enkanLampDark:{file:'enkan-lamp-chamber-dark-v1.png',decodedPreview:'enkan-lamp-chamber-dark-native-preview-v1.png',decodedTiers:'enkan-lamp-chamber-dark-native-tiers-v1.webp',region:null,zones:['story:enkan-lamp-chamber','story:nod-wp-88169','story:frost-wp-99311'],lightMode:'dark',note:'消灯した灯室の仮背景'},
 enkanLamp:{file:'enkan-lamp-chamber-background-v1.png',decodedPreview:'enkan-lamp-chamber-native-preview-v1.png',decodedTiers:'enkan-lamp-chamber-native-tiers-v1.webp',region:null,zones:['story:enkan-lamp-chamber','story:enkan-route-gallery'],note:'局所の灯室と小間の仮背景'},
 enkanomiya:{file:'enkanomiya-background-v1.png',decodedPreview:'enkanomiya-native-preview-v1.png',decodedTiers:'enkanomiya-native-tiers-v1.webp',region:'淵下宮',zones:['abyss']},
 chenyuPavilion:{file:'chenyu-tea-pavilion-background-v1.png',decodedPreview:'chenyu-tea-pavilion-native-preview-v1.png',decodedTiers:'chenyu-tea-pavilion-native-tiers-v1.webp',region:null,zones:['story:chenyu-tea-pavilion'],note:'展望亭と茶畑の仮背景'},
 chenyu:{file:'chenyu-background-v1.png',decodedPreview:'chenyu-native-preview-v1.png',decodedTiers:'chenyu-native-tiers-v1.webp',region:'沈玉の谷',zones:[]},
 spineRidge:{file:'spine-ridge-background-v1.png',decodedPreview:'spine-ridge-native-preview-v1.png',decodedTiers:'spine-ridge-native-tiers-v1.webp',region:null,zones:['story:spine-trace-ridge'],note:'霜紋の稜線の仮背景'},
 dragonspine:{file:'dragonspine-background-v1.png',decodedPreview:'dragonspine-native-preview-v1.png',decodedTiers:'dragonspine-native-tiers-v1.webp',region:'ドラゴンスパイン',zones:[]},
 voyage:{file:'voyage-background-v1.png',decodedPreview:'voyage-native-preview-v1.png',decodedTiers:'voyage-native-tiers-v1.webp',region:'航路',zones:[]},
 snezhnaya:{file:'snezhnaya-background-v1.png',decodedPreview:'snezhnaya-native-preview-v1.png',decodedTiers:'snezhnaya-native-tiers-v1.webp',region:'スネージナヤ',zones:[]},
 nodkrai:{file:'nodkrai-background-v1.png',decodedPreview:'nodkrai-native-preview-v1.png',decodedTiers:'nodkrai-native-tiers-v1.webp',region:'ナド・クライ',zones:[]},
 nodMoonShallows:{file:'nod-moon-shallows-background-v1.png',decodedPreview:'nod-moon-shallows-native-preview-v1.png',decodedTiers:'nod-moon-shallows-native-tiers-v1.webp',zones:['story:nod-moon-shallows','story:nod-tide-rocks','story:nod-lantern-shore','story:nod-box-inlet','story:nod-detour-shore','story:nod-appraisal-yard','story:nod-rumor-ledge','story:nod-tide-scrapyard'],note:'浅瀬と海岸のラボ用仮背景'},
 nodMoonWood:{file:'nod-moon-wood-background-v1.png',decodedPreview:'nod-moon-wood-native-preview-v1.png',decodedTiers:'nod-moon-wood-native-tiers-v1.webp',zones:['story:nod-lull-wood','story:nod-spruce-clearing','story:nod-bloom-gate','story:nod-bloom-trail','story:nod-forest-outer'],note:'木陰と林の外周のラボ用仮背景'},
 nodBloomGrove:{file:'nod-moon-bloom-background-v1.png',decodedPreview:'nod-moon-bloom-native-preview-v1.png',decodedTiers:'nod-moon-bloom-native-tiers-v1.webp',zones:['story:nod-bloom-grove'],note:'月花の観賞区画のラボ用仮背景'},
 nodMoonCave:{file:'nod-moon-cave-background-v1.png',decodedPreview:'nod-moon-cave-native-preview-v1.png',decodedTiers:'nod-moon-cave-native-tiers-v1.webp',zones:['story:nod-moon-cave-mouth','story:nod-moon-crab-arena'],note:'月渡りの岩窟口と月殻の広間のラボ用仮背景'},
 nodMoonVault:{file:'nod-moon-vault-background-v1.png',decodedPreview:'nod-moon-vault-native-preview-v1.png',decodedTiers:'nod-moon-vault-native-tiers-v1.webp',zones:['story:nod-moon-vault'],note:'探検家の貯蔵所のラボ用仮背景'},
 nodNightStalls:{file:'nod-night-stalls-background-v1.png',decodedPreview:'nod-night-stalls-native-preview-v1.png',decodedTiers:'nod-night-stalls-native-tiers-v1.webp',zones:['story:nod-night-stalls','story:nod-rumor-quay'],note:'夜店と波止場のラボ用仮背景'},
 nodFarSea:{file:'nod-far-sea-background-v1.png',decodedPreview:'nod-far-sea-native-preview-v1.png',decodedTiers:'nod-far-sea-native-tiers-v1.webp',zones:['story:nod-far-sea-bench'],note:'沖を眺める腰掛けのラボ用仮背景'},
 nodPatrolCoast:{file:'nod-lantern-patrol-coast-background-v1.png',decodedPreview:'nod-lantern-patrol-coast-native-preview-v1.png',decodedTiers:'nod-lantern-patrol-coast-native-tiers-v1.webp',zones:['story:nod-patrol-shore','story:nod-patrol-bend','story:nod-patrol-post'],note:'灯台が照らす海岸・風よけの曲がり角・合流標の仮背景'},
 nodPatrolCabin:{file:'nod-lantern-patrol-cabin-background-v1.png',decodedPreview:'nod-lantern-patrol-cabin-native-preview-v1.png',decodedTiers:'nod-lantern-patrol-cabin-native-tiers-v1.webp',zones:['story:nod-patrol-cabin'],note:'暖房小屋の仮背景'},
 nodAppraisal:{file:'nod-appraisal-workshop-background-v1.png',decodedPreview:'nod-appraisal-workshop-native-preview-v1.png',decodedTiers:'nod-appraisal-workshop-native-tiers-v1.webp',zones:['story:nod-appraisal-workshop'],note:'アイノの部品工房のラボ用仮背景'},
 mondstadt:{file:'mondstadt-background.png',decodedPreview:'mondstadt-native-preview-v1.png',decodedTiers:'mondstadt-native-tiers-v1.webp',region:'モンド',zones:[]},
 liyue:{file:'liyue-background-v1.png',decodedPreview:'liyue-native-preview-v1.png',decodedTiers:'liyue-native-tiers-v1.webp',region:'璃月',zones:['geo','oceanid','primo','pyro_regisvine']},
 inazuma:{file:'inazuma-background-v1.png',decodedPreview:'inazuma-native-preview-v1.png',decodedTiers:'inazuma-native-tiers-v1.webp',region:'稲妻',zones:['thunder','array','maguu']},
 fontaineScentAtelier:{file:'fon-emilie-scent-atelier-background-v1.png',decodedPreview:'fon-emilie-scent-atelier-native-preview-v1.png',decodedTiers:'fon-emilie-scent-atelier-native-tiers-v1.webp',zones:['story:fon-emilie-atelier'],note:'水辺の調香工房の仮背景'},
 fontaineScentShore:{file:'fon-emilie-scent-shore-background-v1.png',decodedPreview:'fon-emilie-scent-shore-native-preview-v1.png',decodedTiers:'fon-emilie-scent-shore-native-tiers-v1.webp',zones:['story:fon-emilie-scent-shore'],note:'香り草の船着き場の仮背景'},
 fontaineCourtTerrace:{file:'fon-north-terrace-background-v1.png',decodedPreview:'fon-north-terrace-native-preview-v1.png',decodedTiers:'fon-north-terrace-native-tiers-v1.webp',zones:['story:sites-hunt-50057'],note:'廷北の庭園水路の仮背景'},
 fontaineNorthHeadland:{file:'fon-north-headland-background-v1.png',decodedPreview:'fon-north-headland-native-preview-v1.png',decodedTiers:'fon-north-headland-native-tiers-v1.webp',zones:['story:sites-hunt-68347','story:fon-wp-53862','story:fon-wp-55770'],note:'北岸の灯台岬の仮背景'},
 fontaineNorthTidegate:{file:'fon-north-tidegate-background-v1.png',decodedPreview:'fon-north-tidegate-native-preview-v1.png',decodedTiers:'fon-north-tidegate-native-tiers-v1.webp',zones:['story:sites-hunt-68347-pocket-1','story:fon-wp-53858'],note:'浜の水門の仮背景'},
 fontaineNorthStorehouse:{file:'fon-north-storehouse-background-v1.png',decodedPreview:'fon-north-storehouse-native-preview-v1.png',decodedTiers:'fon-north-storehouse-native-tiers-v1.webp',zones:['story:sites-hunt-68347-pocket-2'],note:'北岸の倉庫の仮背景'},
 fontaineNorthLantern:{file:'fon-north-lantern-background-v1.png',decodedPreview:'fon-north-lantern-native-preview-v1.png',decodedTiers:'fon-north-lantern-native-tiers-v1.webp',zones:['story:sites-hunt-68347-pocket-3'],note:'灯台の地下機関室の仮背景'},
 fontaineSunkenReef:{file:'fon-domain-reef-background-v1.png',decodedPreview:'fon-domain-reef-native-preview-v1.png',decodedTiers:'fon-domain-reef-native-tiers-v1.webp',zones:['story:sites-hunt-50067','story:luachra-legend-shelf'],note:'海中の石灰棚と沈んだアーチの仮背景'},
 fontaineSunkenSeal:{file:'fon-domain-seal-background-v1.png',decodedPreview:'fon-domain-seal-native-preview-v1.png',decodedTiers:'fon-domain-seal-native-tiers-v1.webp',zones:['story:sites-hunt-56792'],note:'海中に沈んだ青銅の征討門の仮背景'},
 fontaineMorteDrain:{file:'fon-domain-drain-background-v1.png',decodedPreview:'fon-domain-drain-native-preview-v1.png',decodedTiers:'fon-domain-drain-native-tiers-v1.webp',zones:['story:sites-hunt-63738'],note:'モルテの排水路と圧力塔の仮背景'},
 fontaineMorteValve:{file:'fon-domain-valve-background-v1.png',decodedPreview:'fon-domain-valve-native-preview-v1.png',decodedTiers:'fon-domain-valve-native-tiers-v1.webp',zones:['story:sites-hunt-63738-pocket-1'],note:'氷霜の従者がいる排水弁室の仮背景'},
 fontaineBerylCoast:{file:'fon-beryl-coast-background-v1.png',decodedPreview:'fon-beryl-coast-native-preview-v1.png',decodedTiers:'fon-beryl-coast-native-tiers-v1.webp',zones:['story:sites-hunt-50034','story:fon-wp-50035','story:fontaine-beryl-bank','story:fon-wp-50041','story:fon-wp-50046'],note:'石造水路が見えるベリル沿岸の仮背景'},
 fontaineBerylSluice:{file:'fon-beryl-sluice-background-v1.png',decodedPreview:'fon-beryl-sluice-native-preview-v1.png',decodedTiers:'fon-beryl-sluice-native-tiers-v1.webp',zones:['story:sites-hunt-50034-pocket-1','story:fon-wp-50047'],note:'ベリルの水門脇の仮背景'},
 fontainePhotoTerrace:{file:'fon-navia-photo-terrace-background-v1.png',decodedPreview:'fon-navia-photo-terrace-native-preview-v1.png',decodedTiers:'fon-navia-photo-terrace-native-tiers-v1.webp',zones:['story:fon-photo-terrace'],note:'並木の写真広場の仮背景'},
 fontaineDelivery:{file:'fontaine-delivery-quay-background-v1.png',decodedPreview:'fontaine-delivery-quay-native-preview-v1.png',decodedTiers:'fontaine-delivery-quay-native-tiers-v1.webp',zones:['story:fontaine-parcel-counter','story:fontaine-delivery-quay','story:fontaine-outskirts-loading','story:fon-wp-53852','story:fon-wp-55775','story:sites-lumidouce-landing']},
 fontaineBackstage:{file:'fontaine-backstage-background-v1.png',decodedPreview:'fontaine-backstage-native-preview-v1.png',decodedTiers:'fontaine-backstage-native-tiers-v1.webp',zones:['story:fontaine-old-scenery-door','story:fontaine-moon-fly-loft','story:fontaine-stage-wings','story:fontaine-lift-catwalk','story:fontaine-stage-watch']},
 fontaineUnderstage:{file:'fontaine-understage-background-v1.png',decodedPreview:'fontaine-understage-native-preview-v1.png',decodedTiers:'fontaine-understage-native-tiers-v1.webp',zones:['story:fontaine-understage-workfloor','story:fontaine-parcel-storeroom'],note:'作業床と凶月の再現戦の仮背景'},
 natlanIansanTraining:{file:'nat-iansan-training-course-background-v1.png',decodedPreview:'nat-iansan-training-course-native-preview-v1.png',decodedTiers:'nat-iansan-training-course-native-tiers-v1.webp',zones:['story:natlan-iansan-training'],note:'イアンサの訓練路の仮背景'},
 natlanXilonenLab:{file:'nat-xilonen-course-workshop-background-v1.png',decodedPreview:'nat-xilonen-course-workshop-native-preview-v1.png',decodedTiers:'nat-xilonen-course-workshop-native-tiers-v1.webp',zones:['story:natlan-xilonen-workshop'],note:'試作工房の仮背景'},
 natlanXilonenCourse:{file:'nat-xilonen-course-course-background-v1.png',decodedPreview:'nat-xilonen-course-course-native-preview-v1.png',decodedTiers:'nat-xilonen-course-course-native-tiers-v1.webp',zones:['story:natlan-xilonen-course'],note:'三段の試走路の仮背景'},
 natlanKinichHunt:{file:'nat-kinich-ambush-trail-background-v1.png',decodedPreview:'nat-kinich-ambush-trail-native-preview-v1.png',decodedTiers:'nat-kinich-ambush-trail-native-tiers-v1.webp',zones:['story:natlan-kinich-hunt'],note:'巡り岩の狩道の仮背景'},
 natlanSurfRun:{file:'nat-mualani-surf-run-background-v1.png',decodedPreview:'nat-mualani-surf-run-native-preview-v1.png',decodedTiers:'nat-mualani-surf-run-native-tiers-v1.webp',zones:['story:natlan-surf-run'],note:'水しぶきの練習瀬の仮背景'},
 natlanSurfCove:{file:'nat-mualani-surf-cove-background-v1.png',decodedPreview:'nat-mualani-surf-cove-native-preview-v1.png',decodedTiers:'nat-mualani-surf-cove-native-tiers-v1.webp',zones:['story:natlan-surf-cove'],note:'コホラ竜の入り江の仮背景'},
 natlanCharmTrail:{file:'nat-kachina-charms-trail-background-v1.png',decodedPreview:'nat-kachina-charms-trail-native-preview-v1.png',decodedTiers:'nat-kachina-charms-trail-native-tiers-v1.webp',zones:['story:natlan-charm-trail'],note:'彩石の採集路の仮背景'},
 fontaineToyShallows:{file:'fon-freminet-dive-shallows-background-v1.png',decodedPreview:'fon-freminet-dive-shallows-native-preview-v1.png',decodedTiers:'fon-freminet-dive-shallows-native-tiers-v1.webp',zones:['story:ocean-judge-legend-pool','story:fon-toy-shallows'],note:'浅瀬の試験区画の仮背景'},
 fontaineMagicWings:{file:'fon-lyney-magic-wings-background-v1.png',decodedPreview:'fon-lyney-magic-wings-native-preview-v1.png',decodedTiers:'fon-lyney-magic-wings-native-tiers-v1.webp',zones:['story:fon-magic-wings'],note:'小劇場の舞台裏の仮背景'},
 fontaineMagicSeats:{file:'fon-lyney-magic-seats-background-v1.png',decodedPreview:'fon-lyney-magic-seats-native-preview-v1.png',decodedTiers:'fon-lyney-magic-seats-native-tiers-v1.webp',zones:['story:fon-magic-seats'],note:'小劇場の客席の仮背景'},
 fontaineRehearsal:{file:'fontaine-rehearsal-background-v1.png',decodedPreview:'fontaine-rehearsal-native-preview-v1.png',decodedTiers:'fontaine-rehearsal-native-tiers-v1.webp',zones:['story:fontaine-rehearsal-room']},
 fontaineGrandStage:{file:'fontaine-grand-stage-background-v1.png',decodedPreview:'fontaine-grand-stage-native-preview-v1.png',decodedTiers:'fontaine-grand-stage-native-tiers-v1.webp',zones:[
  'story:fontaine-scenery-booth','story:fontaine-grand-stage-approach','story:fontaine-grand-stage'
 ]},
 fontaine:{file:'fontaine-background-v1.png',decodedPreview:'fontaine-native-preview-v1.png',decodedTiers:'fontaine-native-tiers-v1.webp',region:'フォンテーヌ',zones:[]},
 natlanRaceRidge:{file:'natlan-race-ridge-background-v1.png',decodedPreview:'natlan-race-ridge-native-preview-v1.png',decodedTiers:'natlan-race-ridge-native-tiers-v1.webp',zones:[
  'story:natlan-flag-slope','story:natlan-flag-ledges','story:natlan-flag-cleft',
  'story:natlan-high-trial-steps','story:natlan-high-trial-field','story:natlan-quarry-road'
 ]},
 natlanRaceSummit:{file:'natlan-race-summit-background-v1.png',decodedPreview:'natlan-race-summit-native-preview-v1.png',decodedTiers:'natlan-race-summit-native-tiers-v1.webp',zones:['story:natlan-flag-summit','story:natlan-duel-entry']},
 natlanSunset:{file:'natlan-sunset-arena-background-v1.png',decodedPreview:'natlan-sunset-arena-native-preview-v1.png',decodedTiers:'natlan-sunset-arena-native-tiers-v1.webp',zones:[
  'story:natlan-sunset-review','story:natlan-sunset-arena','story:natlan-sunset-rostrum'
 ]},
 natlanRiverTrial:{file:'natlan-riverside-trial-background-v1.png',decodedPreview:'natlan-riverside-trial-native-preview-v1.png',decodedTiers:'natlan-riverside-trial-native-tiers-v1.webp',zones:['story:natlan-river-float-run','story:natlan-river-turn-basin','story:natlan-riverside-range']},
 natlan:{file:'natlan-background-v1.png',decodedPreview:'natlan-native-preview-v1.png',decodedTiers:'natlan-native-tiers-v1.webp',region:'ナタ',zones:[]},
 sumeruRiverside:{file:'sumeru-riverside-background-v1.png',decodedPreview:'sumeru-riverside-native-preview-v1.png',decodedTiers:'sumeru-riverside-native-tiers-v1.webp',zones:['story:sumeru-river-roots','story:sumeru-river-bank','story:sumeru-root-slope']},
 sumeruObservationTrail:{file:'sum-wanderer-sign-trail-background-v1.png',decodedPreview:'sum-wanderer-sign-trail-native-preview-v1.png',decodedTiers:'sum-wanderer-sign-trail-native-tiers-v1.webp',zones:['story:sum-wanderer-trail'],note:'大樹の裏道の仮背景'},
 sumeruObservationHollow:{file:'sum-wanderer-sign-hollow-background-v1.png',decodedPreview:'sum-wanderer-sign-hollow-native-preview-v1.png',decodedTiers:'sum-wanderer-sign-hollow-native-tiers-v1.webp',zones:['story:sum-wanderer-hollow'],note:'枝切れの洞穴の仮背景'},
 sumeruVisitorsMeadow:{file:'sum-fungus-visitors-meadow-background-v1.png',decodedPreview:'sum-fungus-visitors-meadow-native-preview-v1.png',decodedTiers:'sum-fungus-visitors-meadow-native-tiers-v1.webp',zones:['story:sum-visitors-meadow'],note:'観測器の草地の仮背景'},
 sumeruVisitorsTerrace:{file:'sum-fungus-visitors-terrace-background-v1.png',decodedPreview:'sum-fungus-visitors-terrace-native-preview-v1.png',decodedTiers:'sum-fungus-visitors-terrace-native-tiers-v1.webp',zones:['story:sum-visitors-terrace'],note:'標本台の段丘の仮背景'},
 sumeruVisitorsStore:{file:'sum-fungus-visitors-store-background-v1.png',decodedPreview:'sum-fungus-visitors-store-native-preview-v1.png',decodedTiers:'sum-fungus-visitors-store-native-tiers-v1.webp',zones:['story:sum-visitors-store'],note:'標本の保管所の仮背景'},
 sumeruColleiTrail:{file:'sum-collei-guide-trail-background-v1.png',decodedPreview:'sum-collei-guide-trail-native-preview-v1.png',decodedTiers:'sum-collei-guide-trail-native-tiers-v1.webp',zones:['story:sum-collei-trail'],note:'林巡りの練習道の仮背景'},
 sumeruColleiRain:{file:'sum-collei-guide-rain-background-v1.png',decodedPreview:'sum-collei-guide-rain-native-preview-v1.png',decodedTiers:'sum-collei-guide-rain-native-tiers-v1.webp',zones:['story:sum-collei-rainfork'],note:'水音の分かれ道の仮背景'},
 sumeruColleiWelcome:{file:'sum-collei-guide-welcome-background-v1.png',decodedPreview:'sum-collei-guide-welcome-native-preview-v1.png',decodedTiers:'sum-collei-guide-welcome-native-tiers-v1.webp',zones:['story:sum-collei-welcome'],note:'巡林の集合所の仮背景'},
 sumeruKavehWorkshop:{file:'sum-kaveh-room-workshop-background-v1.png',decodedPreview:'sum-kaveh-room-workshop-native-preview-v1.png',decodedTiers:'sum-kaveh-room-workshop-native-tiers-v1.webp',zones:['story:sum-kaveh-workshop'],note:'樹上の模型工房の仮背景'},
 sumeruKavehRoom:{file:'sum-kaveh-room-room-background-v1.png',decodedPreview:'sum-kaveh-room-room-native-preview-v1.png',decodedTiers:'sum-kaveh-room-room-native-tiers-v1.webp',zones:['story:sum-kaveh-reading-room'],note:'木漏れ日の閲覧室の仮背景'},
 sumeruNahidaGlade:{file:'sum-nahida-map-glade-background-v1.png',decodedPreview:'sum-nahida-map-glade-native-preview-v1.png',decodedTiers:'sum-nahida-map-glade-native-tiers-v1.webp',zones:['story:sum-nahida-dew-glade'],note:'朝露のくぼみの仮背景'},
 sumeruCanopy:{file:'sumeru-canopy-background-v1.png',decodedPreview:'sumeru-canopy-native-preview-v1.png',decodedTiers:'sumeru-canopy-native-tiers-v1.webp',zones:['story:sumeru-canopy-junction','story:sumeru-branch-run','story:sumeru-observation-stop','story:sumeru-observatory-approach','story:sumeru-observatory-terrace','story:sumeru-sky-observatory']},
 sumeru:{file:'sumeru-background-v1.png',decodedPreview:'sumeru-native-preview-v1.png',decodedTiers:'sumeru-native-tiers-v1.webp',region:'スメール',zones:[]}
};
const backgrounds=new Map();
const grayCrystal={image:new Image(),box:[382,175,762,667]};
grayCrystal.image.src='assets/tunigi-gray-crystal-source-v1.png';
const roadsideFile='liyue-roadside-props.png';
const teaCart={file:roadsideFile,box:[0,0,65,56]};
const cargoBox={file:roadsideFile,box:[65,0,30,29]};
const roadSign={file:roadsideFile,box:[95,0,40,45]};
const inaRoadside='inazuma-roadside-props.png',sumRoadside='sumeru-roadside-props.png';
const gate={file:inaRoadside,box:[0,0,55,60]},brush={file:inaRoadside,box:[55,0,80,39]},flag={file:inaRoadside,box:[135,0,15,29]};
const shelter={file:sumRoadside,box:[0,0,85,56]},root={file:sumRoadside,box:[85,0,49,36]};
const worktable={file:sumRoadside,box:[134,0,76,62]},shelf={file:sumRoadside,box:[210,0,40,29]};
const windBanner={file:'mondstadt-roadside-props.png',box:[0,0,31,55]};
const tornBanner={file:'mondstadt-roadside-props.png',box:[31,0,31,33]};
const roadGrass={file:'mondstadt-roadside-props.png',box:[62,0,34,14]};
const streetLamp={file:'fontaine-roadside-props.png',box:[0,0,28,44]};
const buoy={file:'fontaine-roadside-props.png',box:[28,0,15,30]};
const dockCrate={file:'fontaine-roadside-props.png',box:[43,0,38,22]};
const courseFlag={file:'natlan-roadside-props.png',box:[0,0,30,43]};
const rock={file:'natlan-roadside-props.png',box:[30,0,71,55]};
const surfboard={file:'natlan-roadside-props.png',box:[101,0,52,12]};
const stoneBench={file:'natlan-roadside-props.png',box:[153,0,55,48]};
const lantern={file:'nod-roadside-props.png',box:[0,0,16,26]};
const machine={file:'nod-roadside-props.png',box:[16,0,40,56]};
const berry={file:'nod-roadside-props.png',box:[56,0,12,10]};
const snowFlag={file:'snezhnaya-roadside-props.png',box:[0,0,29,32]};
const snowWall={file:'snezhnaya-roadside-props.png',box:[29,0,59,30]};
const lens={file:'snezhnaya-roadside-props.png',box:[88,0,35,21]};
const rubble={file:'snezhnaya-roadside-props.png',box:[123,0,38,10]};
const decorations=new Map([['tunigi-depth',[
 {art:grayCrystal,x:207,y:480,height:78},
 {art:grayCrystal,x:742,y:480,height:94,flip:true},
 {art:grayCrystal,x:1250,y:480,height:112},
]],['liyue-entry',[
 {art:roadSign,x:254,y:480,height:56},
 {art:roadSign,x:1070,y:360,height:45,flip:true},
]],['liyue-loading-yard',[
 {art:cargoBox,x:272,y:393,height:41},
 {art:cargoBox,x:315,y:393,height:34},
 {art:teaCart,x:755,y:480,height:74},
 {art:cargoBox,x:1130,y:290,height:37},
]],['liyue-river-trail',[
 {art:teaCart,x:305,y:480,height:68,flip:true},
 {art:roadSign,x:1000,y:391,height:48},
 {art:cargoBox,x:1440,y:374,height:34},
]],['inazuma-road',[
 {art:gate,x:320,y:480,height:93},
 {art:brush,x:891,y:370,height:34},
]],['inazuma-shore-hunt',[
 {art:flag,x:264,y:480,height:48},
 {art:brush,x:574,y:392,height:28,flip:true},
 {art:flag,x:1230,y:393,height:42},
]],['sumeru-entry',[
 {art:shelter,x:327,y:480,height:87},
 {art:root,x:879,y:350,height:32},
]],['sumeru-field',[
 {art:root,x:265,y:380,height:41},
 {art:root,x:556,y:270,height:32,flip:true},
]],['sum-kaveh-timberyard',[
 {art:worktable,x:280,y:480,height:56},
 {art:shelf,x:457,y:389,height:45},
 {art:shelf,x:1184,y:391,height:35,flip:true},
]],['mond-road',[
 {art:windBanner,x:282,y:480,height:69},
 {art:roadGrass,x:651,y:390,height:27},
]],['mond-old-ground',[
 {art:tornBanner,x:298,y:395,height:55},
 {art:roadGrass,x:675,y:315,height:30},
]],['fontaine-entry',[
 {art:streetLamp,x:312,y:480,height:82},
 {art:streetLamp,x:696,y:300,height:63},
]],['fontaine-field',[
 {art:buoy,x:257,y:480,height:46},
 {art:buoy,x:660,y:280,height:34},
]],['fontaine-outskirts-loading',[
 {art:dockCrate,x:278,y:480,height:42},
 {art:dockCrate,x:513,y:392,height:32},
]],['natlan-entry',[
 {art:courseFlag,x:279,y:480,height:63},
 {art:rock,x:542,y:290,height:46},
]],['natlan-field',[
 {art:rock,x:262,y:370,height:55},
 {art:rock,x:567,y:260,height:38},
]],['natlan-riverside-range',[
 {art:surfboard,x:199,y:480,height:23},
 {art:courseFlag,x:566,y:392,height:39},
]],['natlan-quarry-road',[
 {art:stoneBench,x:259,y:480,height:54},
 {art:rock,x:507,y:389,height:47},
]],['nod-field',[
 {art:lantern,x:250,y:380,height:43},
 {art:lantern,x:591,y:290,height:35},
]],['nod-tide-scrapyard',[
 {art:machine,x:309,y:480,height:67},
 {art:machine,x:572,y:393,height:39},
]],['nod-forest-outer',[
 {art:berry,x:279,y:480,height:37},
 {art:berry,x:523,y:394,height:28},
]],['snezhnaya-entry',[
 {art:snowFlag,x:276,y:480,height:58},
 {art:snowWall,x:562,y:280,height:42},
]],['sne-survey-outskirts',[
 {art:lens,x:279,y:480,height:56},
 {art:snowFlag,x:559,y:393,height:44},
]],['snezhnaya-field',[
 {art:snowWall,x:293,y:380,height:46},
 {art:rubble,x:624,y:290,height:27},
]],['white-pass-cut',[
 {art:rubble,x:317,y:382,height:41},
 {art:snowFlag,x:731,y:382,height:72},
]]]);
function roadsideAsset(frame){
 const node=frame.story?.node;
 const file=decorations.get(node)?.[0].art.file;
 if(file && frame.story.active && frame.campaign?.zone==='story:'+node)return backgroundFor(file);
}
function backgroundFor(file){
 const cached=backgrounds.get(file);
 if(cached)return cached;
 const image=new Image(),entry={image,state:'loading'};
 backgrounds.set(file,entry);
 image.src='assets/'+file;
 entry.ready=image.decode().then(
  ()=>{entry.state=image.naturalWidth&&image.naturalHeight?'ready':'error'},
  ()=>{entry.state='error'},
 );
 return entry;
}

// Explicit bulk loading for the existing scenery audits. Importing this module
// for ordinary play does not start those requests.
let allBackgrounds;
async function loadAllBackgrounds(){
 const files=Array.from(new Set(Object.values(sceneryDefinitions).map(({file})=>file)));
 let next=0;
 async function worker(){
  while(next<files.length)await backgroundFor(files[next++]).ready;
 }
 await Promise.all([
  ...Array.from({length:6},worker),
  grayCrystal.image.decode().catch(()=>{}),
 ]);
}
export const backgroundReady={
 then(resolve,reject){
  allBackgrounds??=loadAllBackgrounds();
  return allBackgrounds.then(resolve,reject);
 },
};
// Compile the location rules once. Some locations have ordered lighting or quest overrides.
const rulesByLocation=new Map();
const sceneryByRegion=new Map();
for(const [key,definition] of Object.entries(sceneryDefinitions)){
 if(definition.region && !sceneryByRegion.has(definition.region))sceneryByRegion.set(definition.region,key);
 for(const location of new Set([...definition.zones,...(definition.clearedZones??[])])){
  let rules=rulesByLocation.get(location);
  if(!rules){rules=[];rulesByLocation.set(location,rules)}
  rules.push({key,lightMode:definition.lightMode,requiresClear:!definition.zones.includes(location)});
 }
}
// Explicit prototype mappings; stale story state must not recolor unrelated lab fights.
export function sceneryKey(frame){
 const zone=frame.campaign?.zone;
 const location=zone==='town'&&frame.story?.active?'story:'+frame.story.node:zone;
 if(frame.story?.active && (zone==='town'||zone?.startsWith('story:')) && frame.storyScenery && Object.hasOwn(sceneryDefinitions,frame.storyScenery))return frame.storyScenery;
 const rules=rulesByLocation.get(location);
 if(rules)for(const rule of rules){
  if((!rule.lightMode||frame.storyLocalLight?.mode===rule.lightMode)&&(!rule.requiresClear||frame.storyCleared))return rule.key;
 }
 if(frame.story?.active&&(zone==='town'||zone?.startsWith('story:'))){
  const node=frame.storyGraph?.nodes?.find(n=>n.id===frame.story.node);
  if(node?.scenery&&Object.hasOwn(sceneryDefinitions,node.scenery))return node.scenery;
  return sceneryByRegion.get(node?.region)??'mondstadt';
 }
 return 'mondstadt';
}
export function sceneryStatus(frame,previewFile){
 const key=sceneryKey(frame),file=previewFile??sceneryDefinitions[key].file;
 const waiting=roadsideAsset(frame)?.state==='loading';
 return {key,file,state:waiting?'loading':backgrounds.get(file)?.state??'loading'};
}
export function loadScenery(frame,previewFile){
 const backdrop=backgroundFor(previewFile??sceneryDefinitions[sceneryKey(frame)].file).ready;
 const roadside=roadsideAsset(frame);
 return roadside?Promise.all([backdrop,roadside.ready]).then(([state])=>state):backdrop;
}
function drawDecorations(ctx,frame,camera){
 const node=frame.story?.node,placements=decorations.get(node);
 if(!placements||!frame.story.active||frame.campaign?.zone!==`story:${node}`)return;
 ctx.imageSmoothingEnabled=false;
 for(const {art,x,y,height,flip} of placements){
  const image=art.image??backgroundFor(art.file).image,box=art.box;
  if(!image.complete||!image.naturalWidth)continue;
  const width=height*box[2]/box[3],screenX=x-camera;
  if(screenX+width/2<=0||screenX-width/2>=960)continue;
  ctx.save();ctx.translate(screenX,y);
  if(flip)ctx.scale(-1,1);
  ctx.drawImage(image,...box,-width/2,-height,width,height);
  ctx.restore();
 }
}
// Reuse a resident source while switching tiers. On a new map, fetch only the chosen raster.
export function drawPlayScenery(ctx,frame,tier){
 const key=sceneryKey(frame),definition=sceneryDefinitions[key];
 let file,tile,message='';
 if(tier){
  if(!definition.decodedTiers){
   message='この地点は元PNGを表示';
  }else{
   const highest=tier===6144;
   const preview=highest?definition.decodedPreview:definition.decodedTiers;
   const state=backgroundFor(preview).state;
   if(state==='ready'){
    file=preview;
    tile=highest?undefined:(tier-4096)/512;
   }else{
    message=state==='error'?'復号画像を読み込めず元PNGを表示':'復号画像を読み込み中';
    if(state==='loading' && backgrounds.get(definition.file)?.state!=='ready')file=preview;
   }
  }
 }
 scenery(ctx,frame,file,tile,key);
 return message;
}

export function scenery(ctx,frame,previewFile,tierTile,key=sceneryKey(frame)){
 ctx.save();ctx.imageSmoothingEnabled=!previewFile;
 const {image:background,state}=backgroundFor(previewFile??sceneryDefinitions[key].file);
 if(state==='ready'){
  // The temporary image has only 200px of overscan. Stop its parallax at
  // either image edge even when the playable map extends farther.
  const w=1160,h=540,offset=(frame.voyage?.scroll??Math.max(0,Math.min(1,(frame.camera||0)/1920)))*(w-960);
  if(tierTile===undefined)ctx.drawImage(background,-offset,0,w,h);
  else ctx.drawImage(background,(tierTile%2)*512,Math.floor(tierTile/2)*288,512,288,-offset,0,w,h);
 }else{ctx.fillStyle='#c5decc';ctx.fillRect(0,0,960,540)}
 // Lab-only terrain proxies. These will be 3D set dressing and colliders in the game.
 const inazuma=['inaCastleKeep','inaFogIslet','inaSeiraiCrags','inaSacredRoots','inaYashioriRift','inaRiftBoneDen','inaSerpentQuarry','inaYougouStair','inaByakkoMeadow','inaThunderaxeCamp'].includes(key)||key==='inazumatown'||key==='inazuma'||key==='toriiforest'||key==='shiomicape';
 const stone=['nodFrostKiln','nodSurfHollow','nodWindShelter','nodFaultGate','liyueMingyunAdit','liyueStonehelmPit','liyueSentinelYard','liyueEmberGrotto','liyueCinderShrine','liyueRootSeal','liyueGoldenVault','liyueSealedCavern','liyueAocangRidge','liyueGeovishapDen','mondFrostRavine','mondAgentHideout','mondWolfTemple','mondFloodedAlcove','mondWindBasin','mondBrokenSpire','mondRiftBurrow','inaSuigetsuPool','inaTideChamber','inaMirrorSanctum','inaTataraFurnace','inaMirrorGallery','inaRiftMachineBay','inaAraumiCistern','inaThunderVault','inaRuinWorkshop','natCentralPath','natFallsCavern','natErodedKiln','natSpringKeyCave','natSpiritAlcove','sumServiceBay','sumMossGate','sumSentinelCourt','seacave','windsplit','cryoField','pyroField','electroField','geoField','primoField','oceanidField','maguuField','arrayField','thunderField','pyroHypostasisField','hydroHypostasisField','wolflordField','ruinSerpentField','bathysmalField','electroVineField','aeonblightField','dendroHypostasisField','baptistField','seahorseField','generatorField','tulpaField','narwhalInner','icewindField','legatusField','suanniField','qucusaurField','configDeviceField','papillaField','overseerField','duckleField','battleshipField','herraField','nightmareField','moonflyField','moongeckoField','spiritspeakerField','vigilField','flugelField','driftingSnowField','immortalConstructField','wavebinderField','dvalinWeekly','andriusWeekly','fontaineNorthHeadland','fontaineNorthTidegate','fontaineNorthLantern','fontaineMorteDrain','fontaineMorteValve','tideCalibration','buriedWeaving','clothService','threadlineRelay','dawnVein','ochkaCliff','ochkaKiln','coastalLookout','windwardWorks','thermalRavine','whitePassCoach','whitePassStation','steamStablingDepot','enkanomiya','enkanLamp','enkanLampDark','nodspecial','novokichev','chasm'].includes(key);
 const roof=key==='mondroof',lookout=key==='mondlookout',sandstone=['sumSandMarket','sumSandBalances','sumSandWindcut','sumSandSentry','sumSandEastBasin','sumRedSandWell','sumRedSandRoost','sumRoyalDen','sumDuneVault','sumDuneCounterweight','asimonField','sumeruDesertTombApproach','wenutField','emperorField','lavaDragonField','tunigiExcavation','tunNorthPass','tunNorthSeep','tunEmberAlcove','tunBlueCut','tunDryCistern','tunSouthIncline','tunAshFissure','chasmQuarryLedge','chasmGeodeDen'].includes(key);
 const bygone=['bygoneBellArchive','bygoneCoralGallery','bygoneSouthSeal','bygoneSiltChamber','nostoiIslandPier','nostoiTidalVault','bygone','bygoneResonance','fontaineSunkenReef','fontaineSunkenSeal'].includes(key);
 const golden=key==='golden'||key==='goldenDock';
 const camera=frame.camera||0,snow=['spineSummitSteps','sneCentralIcewall','sneWarriorShelf','sneWestCutting','sneSnowboundShed','sneCityUnderpass','snezhnaya','dragonspine','cryoHypostasisField','wingspan','snowRailTransfer','spineRidge','whitePassSnow','whiteRainbowBasin','auroraGlass','dawnGlass','sneSurveyRidge','sneSnowMatch'].includes(key);
 const forge=frame.weeklyBoss?.primal;
 if(forge){
  const pit=ctx.createLinearGradient(0,480,0,540);
  pit.addColorStop(0,'rgba(45,21,37,0)');pit.addColorStop(1,'#211325');
  ctx.fillStyle=pit;ctx.fillRect(0,480,forge.left-camera,60);
 }
 drawDecorations(ctx,frame,camera);
 for(const p of frame.storySwim?[]:frame.platforms||[]){
  const x=p.x-camera;if(x+p.w<0||x>960)continue;
  if(p.riverDeck)continue;
  if(sceneryDefinitions[key].surface){
   drawScenerySurface(ctx,sceneryDefinitions[key].surface,x,p);
   continue;
  }
  if(key==='dualCourt'){
   ctx.fillStyle='#504a4e';ctx.fillRect(x,p.y,p.w,p.y===480?60:14);
   ctx.fillStyle='#d8c5a9';ctx.fillRect(x,p.y,p.w,4);
   ctx.fillStyle='#928081';ctx.fillRect(x,p.y+6,p.w,2);
   for(let seam=25;seam<p.w;seam+=72){
    ctx.fillStyle='#6a5b61';ctx.fillRect(x+seam,p.y+8,2,p.y===480?30:6);
   }
   continue;
  }
  if(key==='windcourt'){
   ctx.fillStyle='#375969';ctx.fillRect(x,p.y,p.w,p.y===480?60:16);
   ctx.fillStyle='#e5c997';ctx.fillRect(x,p.y,p.w,4);
   ctx.fillStyle='#85a9a7';ctx.fillRect(x,p.y+6,p.w,2);
   for(let stone=18;stone<p.w;stone+=66){
    ctx.fillStyle='#4c7780';ctx.fillRect(x+stone,p.y+9,2,p.y===480?22:7);
   }
   continue;
  }
  if(key==='solarSparringCourt'){
   ctx.fillStyle='#382d38';ctx.fillRect(x,p.y,p.w,p.y===480?60:14);
   ctx.fillStyle='#c19b7f';ctx.fillRect(x,p.y,p.w,3);
   for(let stone=0;stone<p.w;stone+=78){
    ctx.fillStyle='#524052';ctx.fillRect(x+stone,p.y+5,2,p.y===480?32:7);
   }
   continue;
  }
  if(key==='frostDrillCourt'){
   ctx.fillStyle='#253552';ctx.fillRect(x,p.y,p.w,p.y===480?60:13);
   ctx.fillStyle='#99cbd9';ctx.fillRect(x,p.y,p.w,3);
   for(let stone=0;stone<p.w;stone+=78){
    ctx.fillStyle='#3c5370';ctx.fillRect(x+stone,p.y+5,2,p.y===480?35:7);
   }
   continue;
  }
  if(key==='cruxDuelDeck'){
   ctx.fillStyle='#3c2e35';ctx.fillRect(x,p.y,p.w,p.y===480?60:14);
   ctx.fillStyle='#c29a6c';ctx.fillRect(x,p.y,p.w,3);
   for(let board=0;board<p.w;board+=82){
    ctx.fillStyle='#65505a';ctx.fillRect(x+board,p.y+6,1,p.y===480?28:7);
   }
   continue;
  }
  if(key==='hereticLattice'){
   ctx.fillStyle='#15383d';ctx.fillRect(x,p.y,p.w,p.y===480?60:16);
   ctx.fillStyle='#628c85';ctx.fillRect(x,p.y,p.w,3);
   continue;
  }
  if(key==='mistHunt'||key==='lastJudgment'){
   ctx.fillStyle=key==='lastJudgment'?'#291f35':'#342737';ctx.fillRect(x,p.y,p.w,p.y===480?60:14);
   ctx.fillStyle=key==='lastJudgment'?'#cd897f':'#ad87a6';ctx.fillRect(x,p.y,p.w,3);
   for(let stone=0;stone<p.w;stone+=64){
    ctx.fillStyle='#513a50';ctx.fillRect(x+stone,p.y+5,2,p.y===480?34:7);
   }
   continue;
  }
  if(key==='falseMoonCourt'||key==='falseMoonRift'){
   ctx.fillStyle=key==='falseMoonCourt'?'#273749':'#41324f';ctx.fillRect(x,p.y,p.w,p.y===480?60:16);
   ctx.fillStyle=key==='falseMoonCourt'?'#68839e':'#926f9b';ctx.fillRect(x,p.y,p.w,3);
   continue;
  }
  if(key==='gateCourt'){
   ctx.fillStyle='#36374b';ctx.fillRect(x,p.y,p.w,p.y===480?60:16);
   ctx.fillStyle='#89795f';ctx.fillRect(x,p.y,p.w,3);
   if(p.y===480){
    for(let i=0;i<8;i++){
     ctx.fillStyle=i%2?'#454658':'#535166';ctx.fillRect(40+110*i-camera,p.y+3,110,23);
     ctx.fillStyle='#88775c';ctx.fillRect(40+110*i-camera,p.y+3,1,22);
    }
   }
   continue;
  }
  if(key==='natlanXilonenCourse'&&p.catchDeck&&frame.storySpringCourse?.phase==='lap'){
   ctx.fillStyle='#925f4e';ctx.fillRect(x,p.y,p.w,60);
   ctx.fillStyle='#f4bf86';ctx.fillRect(x,p.y,p.catchDeck,5);
   continue;
  }
  if(key==='natlanSurfRun'&&frame.storySurf?.phase==='run')continue;
  if(key==='natlanSurfCove'||key==='natVolcanicShore'){
   ctx.fillStyle='#bd8558';ctx.fillRect(x,p.y,p.w,60);
   ctx.fillStyle='#ebbf84';ctx.fillRect(x,p.y,p.w,5);
   continue;
  }
   if(key==='nodAppraisal'||key==='nodPatrolCabin'||key==='sneSurveyShed'||key==='sumeruKavehWorkshop'||key==='sumeruKavehRoom'){
    ctx.fillStyle='#5d474d';ctx.fillRect(x,p.y,p.w,p.y===480?60:17);
    ctx.fillStyle='#bd906b';ctx.fillRect(x,p.y,p.w,4);
    ctx.fillStyle='#916a59';for(let i=10;i+14<p.w;i+=41)ctx.fillRect(x+i,p.y+7,15,3);
    continue;
   }
   if(key==='nodPatrolCoast'||key==='mondNightHill'||key==='fireworkLookouts'||key==='fireworkBeach'||key==='teaLanding'){
    ctx.fillStyle='#252e48';ctx.fillRect(x,p.y,p.w,p.y===480?61:19);
    ctx.fillStyle='#798597';ctx.fillRect(x,p.y,p.w,3);
    ctx.fillStyle='#445671';
    for(let i=7;i+21<p.w;i+=51){
     ctx.fillRect(x+i,p.y+6,20,3);
     ctx.fillRect(x+i+12,p.y+10,15,3);
    }
    continue;
   }
   if(p.moonDeck){
    const spread=p.deployedAt===undefined?1:Math.max(0,Math.min(1,(frame.t-p.deployedAt)/.48));
    const width=Math.ceil(p.w*spread);
    ctx.fillStyle='#273b58';ctx.fillRect(x,p.y,width,18);
    ctx.fillStyle='#b6cde2';ctx.fillRect(x,p.y,width,4);
    for(let i=4;i+6<width;i+=34){
     ctx.fillStyle='#4d6780';ctx.fillRect(x+i,p.y+6,Math.min(29,width-i),8);
     ctx.fillStyle='#eac78a';ctx.fillRect(x+i,p.y+9,6,5);
    }
    continue;
   }
   if(key==='nodMoonWood'||key==='nodMoonCave'||key==='nodMoonVault'||key==='nodFarSea'||key==='nodBloomGrove'){
    const cave=key==='nodMoonCave'||key==='nodMoonVault',ground=p.y===480;
    ctx.fillStyle=cave?'#3e485f':'#364f4b';ctx.fillRect(x,p.y,p.w,ground?61:17);
    ctx.fillStyle=cave?'#8897a5':'#8aa184';ctx.fillRect(x,p.y,p.w,3);
    ctx.fillStyle=cave?'#536579':'#547569';
    for(let i=7;i+18<p.w;i+=43){
     ctx.fillRect(x+i,p.y+6,20,4);ctx.fillRect(x+i+13,p.y+10,15,3);
    }
    continue;
   }
  if(p.raceRock){
   ctx.fillStyle=p.raceBridge?'#8e593e':'#a96548';ctx.fillRect(x,p.y,p.w,p.y===480?56:16);
   ctx.fillStyle=p.raceBridge?'#e2ad71':'#c8a052';ctx.fillRect(x,p.y,p.w,5);
   ctx.fillStyle=p.raceBridge?'#b37e55':'#8a5342';
   for(let i=11;i+20<p.w;i+=42){ctx.fillRect(x+i,p.y+7,19,3);ctx.fillRect(x+i+14,p.y+10,14,3)}
   continue;
  }
  if(p.stageDeck){
   ctx.fillStyle='#664739';ctx.fillRect(x,p.y,p.w,20);
   ctx.fillStyle=p.arrangementDeck?'#d7b67b':'#bd9563';ctx.fillRect(x,p.y,p.w,5);
   ctx.fillStyle='#8e6245';
   for(let i=8;i+12<p.w;i+=42){ctx.fillRect(x+i,p.y+8,30,3);ctx.fillRect(x+i,p.y+14,2,4)}
   continue;
  }
  if(p.leafBridge||p.rootShelf){
   const leaf=p.leafBridge;
   ctx.fillStyle=leaf?'#437466':'#77624a';ctx.fillRect(x,p.y,p.w,18);
   ctx.fillStyle=p.preview?'#d8bd85':leaf?'#add382':'#a6a974';ctx.fillRect(x,p.y,p.w,5);
   ctx.fillStyle=leaf?'#86a96b':'#aa8d67';
   for(let i=9;i+26<p.w;i+=39){ctx.fillRect(x+i,p.y+6,17,3);ctx.fillRect(x+i+15,p.y+9,8,3)}
   continue;
  }
  if(p.paperFold){
   ctx.fillStyle=p.paperPreview?'#ab7f9e':'#66877e';ctx.fillRect(x,p.y,p.w,14);
   ctx.fillStyle=p.paperPreview?'#e5c4d0':'#dce9c3';ctx.fillRect(x,p.y,p.w,4);
   ctx.fillStyle=p.paperPreview?'#cb9bae':'#8eaea0';for(let i=11;i+12<p.w;i+=37)ctx.fillRect(x+i,p.y+6,12,4);
   continue;
  }
  if(p.trolleyTrack){
   ctx.fillStyle='#4a675f';ctx.fillRect(x,p.y+36,p.w,24);
   ctx.fillStyle='#9b8066';for(let i=0;i<p.w;i+=29)ctx.fillRect(x+i,p.y+39,Math.min(14,p.w-i),7);
   ctx.fillStyle='#657f82';ctx.fillRect(x,p.y+36,p.w,4);
   continue;
  }
  if(p.resonanceBridge){
   ctx.fillStyle='#365060';ctx.fillRect(x,p.y,p.w,18);
   ctx.fillStyle='#9bd3ba';ctx.fillRect(x,p.y,p.w,4);
   ctx.fillStyle='#d9c88c';for(let i=13;i<p.w-12;i+=24)ctx.fillRect(x+i,p.y+7,5,4);
   continue;
  }
  if(key==='goldenGrotto'){
   ctx.fillStyle='#546479';ctx.fillRect(x,p.y,p.w,p.y===480?60:23);
   ctx.fillStyle='#a1a296';ctx.fillRect(x,p.y,p.w,6);
   ctx.fillStyle='#dbc19f';for(let i=5;i<p.w-10;i+=43)ctx.fillRect(x+i,p.y+1,Math.min(24,p.w-i),3);
   continue;
  }
  if(p.airflowDeck){
   ctx.fillStyle=p.preview?'#81728a':'#796353';ctx.fillRect(x,p.y,p.w,17);
   ctx.fillStyle=p.preview?'#cdb7df':'#a5d7b6';ctx.fillRect(x,p.y,p.w,4);
   ctx.fillStyle='#d2a476';for(let i=7;i<p.w-6;i+=21)ctx.fillRect(x+i,p.y+7,4,5);
   continue;
  }
  if(p.shadowBridge){
   ctx.fillStyle='#536a93';ctx.fillRect(x,p.y,p.w,18);
   ctx.fillStyle='#b7e1e9';ctx.fillRect(x,p.y,p.w,4);
   ctx.fillStyle='#7e9bb8';for(let i=8;i<p.w-12;i+=26)ctx.fillRect(x+i,p.y+8,16,3);
   continue;
  }
  if(p.cover){
   const h=480-p.y;
   ctx.fillStyle='#565e4c';ctx.fillRect(x,p.y,p.w,h);
   ctx.fillStyle='#7c8067';ctx.fillRect(x,p.y+3,p.w-14,h-16);
   ctx.fillStyle='#a9aa88';ctx.fillRect(x,p.y,p.w,7);
   ctx.fillStyle='#687d4d';ctx.fillRect(x+6,p.y,p.w*.65,5);
   ctx.fillStyle='#656b52';for(let i=14;i<p.w-15;i+=24)ctx.fillRect(x+i,p.y+23+(i%19),4,h*.44);
   continue;
  }
  ctx.fillStyle=bygone?'#436c7b':key==='ochkanatlan'?'#687275':key==='tunigi'?'#94704f':golden?'#ad9064':sandstone?'#765540':stone?'#555d80':key==='voyage'?'#765641':roof?'#866058':lookout?'#776b61':snow?'#6f8197':key==='natlan'?'#a16646':key==='fontaine'?'#9c9b9e':key==='liyue'?'#887653':inazuma?'#686174':p.y===480?'#655c43':'#756d56';ctx.fillRect(x,p.y,p.w,p.y===480?60:24);
  ctx.fillStyle=bygone?'#92aea9':key==='ochkanatlan'?'#8d9b82':key==='tunigi'?'#bd966c':golden?'#d7b981':sandstone?'#ad7952':stone?'#858cab':key==='voyage'?'#ac8258':roof?'#b2846c':lookout?'#ab9e86':snow?'#c9dded':key==='fontaine'?'#bbbfc5':inazuma?'#697b79':'#508451';ctx.fillRect(x,p.y,p.w,7);ctx.fillStyle=bygone?'#e0d6a3':key==='ochkanatlan'?'#c7d0be':key==='tunigi'?'#ead2a0':golden?'#f7e3b1':sandstone?'#dfae73':stone?'#c4c8dd':key==='voyage'?'#d6b17a':roof?'#efbb94':lookout?'#dfcba6':snow?'#f1f7ff':key==='fontaine'?'#f0e9da':inazuma?'#c5bbd2':'#bed088';ctx.fillRect(x,p.y,p.w,2);
  ctx.fillStyle=bygone?'#b6baaa':key==='ochkanatlan'?'#a5ada5':key==='tunigi'?'#c2a17c':golden?'#dfc998':sandstone?'#886047':stone?'#949bb9':key==='voyage'?'#b69069':roof?'#ac796d':lookout?'#a19583':snow?'#a1b7cc':'#a09675';for(let n=0;n<p.w;n+=40){if(x+n>-40&&x+n<960)ctx.fillRect(x+n+5,p.y+11,27,5)}
 }
 if(frame.storyColleiGuide?.rain){
  ctx.fillStyle='#283e5940';ctx.fillRect(0,0,960,540);
  ctx.strokeStyle='#d1ece95e';ctx.lineWidth=1.3;ctx.beginPath();
  const drift=frame.t*310;
  for(let i=0;i<88;i++){
   const x=(i*197+Math.floor(drift/65)*12)%980;
   const y=(i*87+drift)%568-24;
   ctx.moveTo(x,y);ctx.lineTo(x-5,y+12+i%8);
  }
  ctx.stroke();
 }
 ctx.restore();
}
