"""Represent authored rectangle runs as five unsigned bytes with a local palette."""
import base64
import struct

def pack_grid(grid, *, compact_positions=False):
    runs=grid['runs']
    palette=list(dict.fromkeys(row[4] for row in runs))
    indices={color:i for i,color in enumerate(palette)}
    wide = any(max(row[:4]) > 255 for row in runs)
    short_sizes = wide and compact_positions and all(max(row[2:4]) <= 255 for row in runs)
    record = struct.Struct('<2H3B' if short_sizes else '<4HB' if wide else '<5B')
    raw = b''.join(record.pack(x,y,w,h,indices[color]) for x,y,w,h,color in runs)
    if short_sizes:
        # Group equal-significance bytes so the ZIP dictionary sees adjacent coordinates.
        raw = b''.join(raw[offset::record.size] for offset in range(record.size))
    encoded = base64.b64encode(raw).decode('ascii')
    restored = base64.b64decode(encoded)
    if short_sizes:
        count = len(runs)
        restored = bytes(value for row in zip(*(restored[i*count:(i+1)*count]
                                                for i in range(record.size))) for value in row)
    decoded = record.iter_unpack(restored)
    assert [[x,y,w,h,palette[i]] for x,y,w,h,i in decoded] == runs
    packed = dict(width=grid['width'],height=grid['height'],palette=palette,data=encoded)
    if short_sizes:
        packed['planarXY16'] = True
    elif wide:
        packed['wide'] = True
    return packed
