"""Encode the base tree and ordered refinements consumed by assets/MapleCodec.lua."""

import re
import struct
import zlib

import numpy as np
import zopfli.zlib

# Exclude both quote marks, backslash and the dot token used by the stage validator.
ALPHABET = bytes(i for i in range(32, 127) if i not in (34, 39, 46, 92))
LITERAL = re.compile(rb'"!([' + re.escape(ALPHABET) + rb']+)"')
digit = {byte: i for i, byte in enumerate(ALPHABET)}
WIDTHS = (1, 2, 3, 4, 6, 8, 12, 16, 24, 32)
HEIGHTS = (1, 2, 3, 4, 6, 8, 12, 16, 24)


def encode(data):
    output = bytearray(b"!")
    bits = word = 0
    for byte in data:
        word |= byte << bits
        bits += 8
        if bits >= 13:
            value = word & 8191
            output.extend((ALPHABET[value % 91], ALPHABET[value // 91]))
            bits -= 13
            word >>= 13
    if bits:
        output.extend((ALPHABET[word % 91], ALPHABET[word // 91]))
    return bytes(output)


def unpack(payload, variable):
    output = bytearray()
    word = bits = 0
    for a, b in zip(payload[::2], payload[1::2]):
        value = digit[a] + 91 * digit[b]
        width = 14 if variable and (value & 8191) < 89 else 13
        word |= value << bits
        bits += width
        while bits >= 8:
            output.append(word & 255)
            word >>= 8
            bits -= 8
    return bytes(output)


def pack_variable(stream):
    output = bytearray()
    word = bits = 0
    for c in stream:
        word |= c << bits
        bits += 8
        if bits >= 14:
            value = word & 8191
            width = 13 if value >= 89 else 14
            value = word & ((1 << width) - 1)
            output.extend((ALPHABET[value % 91], ALPHABET[value // 91]))
            word >>= width
            bits -= width
    if bits:
        output.extend((ALPHABET[word % 91], ALPHABET[word // 91]))
    return bytes(output)


def convert_literals(source):
    def convert(match):
        payload = match[1]
        assert len(payload) % 2 == 0
        padded = unpack(payload, False)
        decoder = zlib.decompressobj(-15)
        decoder.decompress(padded)
        assert decoder.eof
        stream = padded[: len(padded) - len(decoder.unused_data)]
        encoded = pack_variable(stream)
        if len(encoded) >= len(payload):
            return match[0]
        assert unpack(encoded, True)[: len(stream)] == stream
        return b'"?' + encoded + b'"'

    return LITERAL.sub(convert, source)


def var(value):
    result = bytearray()
    while value >= 128:
        result.append(128 + (value & 127))
        value >>= 7
    result.append(value)
    return result


def getvar(data, pos):
    value = shift = 0
    while True:
        byte = data[pos]
        pos += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, pos
        shift += 7


class Bits:
    def __init__(self):
        self.data = bytearray()
        self.offset = 0

    def put(self, value, width=1):
        assert 0 <= value < 1 << width
        for i in range(width):
            b = self.offset % 8
            if b == 0:
                self.data.append(0)
            self.data[-1] |= ((value >> i) & 1) << b
            self.offset += 1


def pack_tree(raw):
    flags, axes, cuts = Bits(), Bits(), Bits()
    offset = 0

    def walk(w, h):
        nonlocal offset
        op, offset = getvar(raw, offset)
        if w == h == 1:
            assert op == 0
            return
        flags.put(bool(op))
        if op:
            axis = op & 1
            if min(w, h) > 1:
                axes.put(axis)
            else:
                assert axis == int(w == 1)
            n = h if axis else w
            cut = op // 2
            cuts.put(cut - 1, (n - 2).bit_length())
            if axis:
                walk(w, cut)
                walk(w, h - cut)
            else:
                walk(cut, h)
                walk(w - cut, h)

    walk(512, 288)
    assert len(raw) - offset == 3 * 4096
    return (
        struct.pack("<HH", len(flags.data), len(axes.data))
        + flags.data
        + axes.data
        + cuts.data
        + raw[offset:]
    )


def pack_rows(raw):
    items = list(struct.iter_unpack("<HHBBBBB", raw))
    planes = [bytearray() for _ in range(7)]
    assert 0 < len(items) <= 2048
    for off in range(0, len(items), 256):
        batch = items[off : off + 256]
        touched = set()
        for x, y, w, h, *_ in batch:
            covered = {j * 512 + i for j in range(y, y + h) for i in range(x, x + w)}
            assert not (covered & touched)
            touched.update(covered)
        # Reorder only within a verified disjoint batch. Later batches keep priority.
        lastpos = 0
        for x, y, w, h, r, g, b in sorted(batch, key=lambda v: (v[1], v[0])):
            pos = 512 * y + x
            diff = pos - lastpos
            lastpos = pos
            for plane, value in zip(
                planes,
                [
                    diff & 255,
                    (diff >> 8) & 255,
                    diff >> 16,
                    WIDTHS.index(w) + 16 * HEIGHTS.index(h),
                    r,
                    g,
                    b,
                ],
            ):
                plane.append(value)
    raw = b"".join(planes)
    return encode(zopfli.zlib.compress(raw, numiterations=16)[2:-4])


def spread(x):
    return sum(((x >> i) & 1) << (2 * i) for i in range(9))


def pack_filtered(raw):
    rects = np.array(list(struct.iter_unpack("<HHBBBBB", raw)), dtype=int)
    for off in range(0, len(rects), 256):
        used = np.zeros((288, 512), bool)
        for px, py, pw, ph, *_ in rects[off : off + 256]:
            area = used[py : py + ph, px : px + pw]
            if area.shape != (ph, pw) or area.any():
                raise ValueError(
                    "Overlapping or out-of-bounds patch in reorderable batch"
                )
            area[:] = True
    x, y, w, h, r, g, b = rects.T
    shape = np.array([WIDTHS.index(i) + 16 * HEIGHTS.index(j) for i, j in zip(w, h)])
    options = []
    for axis, pos in enumerate([512 * y + x, 512 * x + y, spread(x) + 2 * spread(y)]):
        order = np.concatenate(
            [a + np.argsort(pos[a : a + 256]) for a in range(0, len(x), 256)]
        )
        values = pos[order].copy()
        for off in range(0, len(x), 256):
            group = values[off : off + 256]
            group[1:] = np.diff(group)
        head = [values, values >> 8, values >> 16, shape[order]]
        for mode in range(4):
            channels = np.array(
                [r - g if mode & 1 else r, g, b - g if mode & 1 else b]
            )[:, order]
            if mode & 2:
                channels[:, 1:] = np.diff(channels, axis=1)
            data = (
                bytes([axis + 4 * mode])
                + np.vstack([*head, *channels]).astype("uint8").tobytes()
            )
            options.append((len(zlib.compress(data, 9)), data))
    _, data = min(options, key=lambda p: p[0])
    return encode(zopfli.zlib.compress(data, numiterations=16)[2:-4])
