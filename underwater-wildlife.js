export function wildlifeSites(layouts){
 const nodes={};
 for(const [art,layout] of Object.entries(layouts)){
  for(const [node,site] of Object.entries(layout.habitats??{})){
   (nodes[node]??=[]).push({art,...site});
  }
 }
 return nodes;
}
