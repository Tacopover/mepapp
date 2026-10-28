import json, math
W = '/tmp/claude-0/-root-MepApp--claude-worktrees-routing-feedback/4946bbd0-c4f1-4f63-99c6-5b34c429a21c/scratchpad/p2-analysis/'
BASE = W + '00_arch_ground_floor_w_rooms'
MM_PER_PT = 17.64  # 1:50, calibration pageUnitsPerRealUnit 0.0567 pt/mm


def load(suffix):
    return json.load(open(BASE + suffix + '.json'))


def pip(pt, poly):
    x, y = pt
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def room_poly(r):
    return [(p['x'], p['y']) for p in r['polygon']['outer']]


def room_of(pt, rooms):
    best = None
    for r in rooms:
        if pip(pt, room_poly(r)):
            a = area(room_poly(r))
            if best is None or a < best[0]:
                best = (a, r)
    return best[1] if best else None


def area(poly):
    s = 0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2


def port_pos(st, port):
    t = st['transform']
    w, h = st['nativeWidth'], st['nativeHeight']
    lx = (port['fractionX'] - 0.5) * w * t['scale']['x']
    ly = (port['fractionY'] - 0.5) * h * t['scale']['y']
    a = math.radians(t['rotationDegrees'])
    return (t['position']['x'] + lx * math.cos(a) - ly * math.sin(a),
            t['position']['y'] + lx * math.sin(a) + ly * math.cos(a))
