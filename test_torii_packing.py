"""Compare the same room commands with inline rectangles and with shared motifs."""
import gzip
import json
from pathlib import Path

root=Path(__file__).resolve().parent
forest=json.loads((root/'content/worksite-props.json').read_bytes())['forest']
flat_rooms={}
references=0
for node,phases in forest['rooms'].items():
    flat_rooms[node]={}
    for phase,placements in phases.items():
        flat=[]
        for name,x,y,*motion in placements:
            references+=1
            for dx,dy,w,h,color in forest['motifs'][name]:
                flat.append([x+dx,y+dy,w,h,color,*motion])
        flat_rooms[node][phase]=flat
        for lift in set(forest['offsets']):
            packed=[(x+dx,y+dy+(lift if motion else 0),w,h,color)
                    for name,x,y,*motion in placements for dx,dy,w,h,color in forest['motifs'][name]]
            inline=[(x,y+(lift if motion else 0),w,h,color) for x,y,w,h,color,*motion in flat]
            assert packed==inline
baseline=dict(rooms=flat_rooms,offsets=forest['offsets'],notes=forest['notes'])

def sizes(data):
    raw=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode('utf8')
    return dict(jsonBytes=len(raw),gzipBytes=len(gzip.compress(raw,compresslevel=9,mtime=0)))

report=dict(inline=sizes(baseline),shared=sizes(forest),placements=references,
            inlineRectangles=sum(len(r) for room in flat_rooms.values() for r in room.values()),
            sharedRectangles=sum(len(r) for r in forest['motifs'].values()),
            poses=len(set(forest['offsets'])),beats=len(forest['offsets']))
(root/'evidence/torii-layout-size.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(report)
