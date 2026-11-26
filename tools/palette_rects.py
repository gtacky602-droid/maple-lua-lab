"""Represent authored rectangle runs as five unsigned bytes with a local palette."""
import base64
import struct

def pack_grid(grid):
    runs=grid['runs']
    palette=list(dict.fromkeys(row[4] for row in runs))
    indices={color:i for i,color in enumerate(palette)}
    wide = any(max(row[:4]) > 255 for row in runs)
    record = struct.Struct('<4HB' if wide else '<5B')
    raw = b''.join(record.pack(x,y,w,h,indices[color]) for x,y,w,h,color in runs)
    encoded = base64.b64encode(raw).decode('ascii')
    decoded = record.iter_unpack(base64.b64decode(encoded))
    assert [[x,y,w,h,palette[i]] for x,y,w,h,i in decoded] == runs
    packed = dict(width=grid['width'],height=grid['height'],palette=palette,data=encoded)
    if wide:
        packed['wide'] = True
    return packed
