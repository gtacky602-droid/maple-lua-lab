"""Inventory idle sprites from live enemy placements and compare legend source crops."""
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
import json
from html.parser import HTMLParser
from palette_rects import pack_grid
from legend_light_blend import refine_legend_profiles

root=Path(__file__).resolve().parents[1]
def read(path):
    return json.loads((root/path).read_bytes())
def encode(value):
    return (json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n').encode()

class SpeciesLabels(HTMLParser):
    def __init__(self):
        super().__init__()
        self.labels={}
        self.active=False
        self.option=None
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='select':
            self.active=attrs.get('id')=='species'
        if tag=='option' and self.active:
            self.option=attrs.get('value')
    def handle_data(self,text):
        if self.option:self.labels[self.option]=text
    def handle_endtag(self,tag):
        if tag=='option':self.option=None
        if tag=='select':self.active=False

@lru_cache(None)
def sprite(file):
    return read('assets/'+file)
def crop(file):
    art=refine_legend_profiles(file,sprite(file))
    return art['source'],tuple(art['box'])

nodes={n['id']:n for n in read('content/story-graph.json')['nodes']}
layouts=read('content/enemy-art-layout.json')
spawns=read('content/enemy-spawns.json')['nodes']
places=defaultdict(Counter)
for node,rows in spawns.items():
    for row in rows:
        places[row['art']][node]+=1

labels=SpeciesLabels()
labels.feed((root/'map-art.html').read_text('utf8'))
gallery_items=read('content/boss-art-gallery.json')['items']
gallery={'boss-'+r['id']:r['file'] for r in gallery_items}
candidates={}
for item in gallery_items:
    targets=item.get('candidateFor',[])
    for target in ([targets] if isinstance(targets,str) else targets):
        candidates[target]=item
candidate_matches=defaultdict(dict)
openings=read('content/group-legend-openings.json')
shared=defaultdict(dict)
for b in read('content/field-boss-spawns.json')['fieldBosses']:
    if not b['id'].startswith('legend-'):continue
    parts=openings.get(b['node'],{}).get('parts',[])
    fallback=[b]+([b['partner']] if b.get('partner') else [])
    files=[p.get('file') or gallery.get(p['species']) for p in parts] if parts else [gallery.get(p.get('mapIdleArt')) for p in fallback]
    for part in parts:
        candidate=candidates.get(part.get('id'))
        if candidate:
            ordinary=candidate.get('ordinaryVariant')
            file=layouts[ordinary]['file'] if ordinary else candidate['file']
            candidate_matches[crop(file)][b['node']]=b['name']
    for file in filter(None,files):
        shared[crop(file)][b['node']]=b['name']

daily=read('assets/daily-guide-sprites.json')
extra={}
species=[]
for key,counts in sorted(places.items()):
    layout=layouts[key]
    file=layout.get('file',key+'-idle-sprites.json')
    art=sprite(file)
    profiles={k:pack_grid(art['profiles'][k]) for k in ('h48c32','h32c16')}
    packed=dict(source=art['source'],box=art['box'],profiles=profiles)
    if key in daily:
        assert daily[key]==packed,key
    else:
        extra[key]=packed
    extra_labels={'anemo-slime':'風スライム','pebble-courier':'小石運び','snow-mantle-beetle':'雪まとい甲虫',
                  'sled-maintenance-cart':'整備用そりカート','sail-shell-crawler':'帆殻の這い虫'}
    name=layout.get('name') or labels.labels.get(key) or extra_labels[key]
    species.append(dict(id=key,name=name.split('（')[0],file=file,height=layout['height'],
                        daily=key in daily,count=sum(counts.values()),places=sorted(counts.items()),
                        legends=shared.get(crop(file),{})))
    if crop(file) in candidate_matches:
        species[-1]['legendCandidates']=candidate_matches[crop(file)]
index=dict(species=species,places={n:[nodes[n]['name'],nodes[n]['region']] for n in sorted(spawns)})
(root/'content/field-sprite-index.json').write_bytes(encode(index))
(root/'assets/field-guide-extra-sprites.json').write_bytes(encode(extra))
print(len(species),'sprites,',sum(v['count'] for v in species),'placements,',len(spawns),'maps;',sum(bool(s['legends']) for s in species),'sprites shared with legend previews')
