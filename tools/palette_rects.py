"""Represent authored rectangle runs as five unsigned bytes with a local palette."""
import base64

def pack_grid(grid):
    runs=grid['runs']
    palette=list(dict.fromkeys(row[4] for row in runs))
    indices={color:i for i,color in enumerate(palette)}
    raw=bytes(v for x,y,w,h,color in runs for v in (x,y,w,h,indices[color]))
    encoded=base64.b64encode(raw).decode('ascii')
    decoded=base64.b64decode(encoded)
    assert [[*decoded[i:i+4],palette[decoded[i+4]]] for i in range(0,len(decoded),5)]==runs
    return dict(width=grid['width'],height=grid['height'],palette=palette,data=encoded)
