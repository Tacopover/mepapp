import sys
from common import *
from collections import defaultdict

ROUTE_AREA_TYPES = {'corridor', 'shaft'}
XNODES = True
d = load('_route')
rooms = d['rooms']
RM = {r['id']: r for r in rooms}
stamps = {s['id']: s for s in d['stamps']}
terms = [s for s in d['stamps'] if s['category'] == 'terminal']
ahu = [s for s in d['stamps'] if s['category'] == 'equipment'][0]
ahu_pt = port_pos(ahu, ahu['ports'][0])
term_pts = []
for s in terms:
    for p in s['ports']:
        term_pts.append((s['id'], port_pos(s, p)))
room_terms = defaultdict(list)
for sid, pt in term_pts:
    r = room_of(pt, rooms)
    room_terms[r['id'] if r else None].append((sid, pt))
served = {k for k in room_terms if k}


def pt_class(pt):
    r = room_of(pt, rooms)
    if r is None:
        return 'wall', None
    if r['id'] in served:
        return 'served', r['id']
    if r.get('roomTypeId') in ROUTE_AREA_TYPES:
        return 'corridor', r['id']
    return 'other', r['id']


def r1(p):
    return (round(p[0], 1), round(p[1], 1))


def snap_axis(vals, gap=4.0):
    vs = sorted(set(vals))
    groups = []
    for v in vs:
        if groups and v - groups[-1][-1] <= gap:
            groups[-1].append(v)
        else:
            groups.append([v])
    m = {}
    for g in groups:
        c = sum(g) / len(g)
        for v in g:
            m[v] = c
    return m


def build_graph(strokes, snap):
    """strokes: list of (color, [pts]). Returns nodes(dict id->pt), edges(dict (i,j)->color set)."""
    if snap:
        xs = snap_axis([p[0] for _, pl in strokes for p in pl])
        ys = snap_axis([p[1] for _, pl in strokes for p in pl])
        strokes = [(c, [(xs[p[0]], ys[p[1]]) for p in pl]) for c, pl in strokes]
    segs = set()
    for c, pl in strokes:
        for a, b in zip(pl, pl[1:]):
            a = (round(a[0], 2), round(a[1], 2)); b = (round(b[0], 2), round(b[1], 2))
            if a == b:
                continue
            segs.add((c, min(a, b), max(a, b)))
    pts = set()
    for c, a, b in segs:
        pts.add(a); pts.add(b)
    if XNODES and snap:
        sl = list(segs)
        for i in range(len(sl)):
            for j in range(i + 1, len(sl)):
                r = seg_inter(sl[i][1], sl[i][2], sl[j][1], sl[j][2])
                if r:
                    q = (round(r[0][0], 2), round(r[0][1], 2))
                    if all(math.hypot(q[0] - o[0], q[1] - o[1]) > 1.0 for o in pts):
                        pts.add(q)
    pts = list(pts)
    edges = {}
    TOL = 1.5
    for c, a, b in segs:
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        on = [(0.0, a), (L, b)]
        for p in pts:
            if p == a or p == b:
                continue
            t = (p[0] - a[0]) * ux + (p[1] - a[1]) * uy
            if t <= TOL or t >= L - TOL:
                continue
            dist = abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux)
            if dist <= TOL:
                on.append((t, p))
        on.sort()
        for (t1, p1), (t2, p2) in zip(on, on[1:]):
            k = (min(p1, p2), max(p1, p2))
            edges.setdefault(k, set()).add(c)
    return edges


def adj_of(edges):
    adj = defaultdict(list)
    for (a, b) in edges:
        adj[a].append(b); adj[b].append(a)
    return adj


def ang(a, b):
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))


def turn(a, b, c):
    t = abs(ang(b, c) - ang(a, b)) % 360
    if t > 180:
        t = 360 - t
    return t


def metrics(edges, label):
    adj = adj_of(edges)
    out = {'label': label}
    out['graph_edges'] = len(edges)
    out['length_pt'] = sum(math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in edges)
    out['length_m'] = out['length_pt'] * MM_PER_PT / 1000
    bends = []
    tees = []
    crosses = []
    ends = []
    for n, nb in adj.items():
        if len(nb) == 1:
            ends.append(n)
        elif len(nb) == 2:
            t = turn(nb[0], n, nb[1])
            if t > 5:
                bends.append((n, round(t)))
        elif len(nb) == 3:
            tees.append(n)
        else:
            crosses.append(n)
    out['ends'] = ends; out['bends'] = bends; out['tees'] = tees; out['crosses'] = crosses
    return out


def loc_counts(pts):
    c = defaultdict(int)
    for p in pts:
        c[pt_class(p)[0]] += 1
    return dict(c)


def bend_split(m):
    b90 = [n for n, t in m['bends'] if t >= 70]
    b45 = [n for n, t in m['bends'] if t < 70]
    return b90, b45


def length_by_class(edges):
    c = defaultdict(float)
    for a, b in edges:
        L = math.hypot(a[0] - b[0], a[1] - b[1])
        n = max(1, int(L / 5))
        for i in range(n):
            t = (i + 0.5) / n
            p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            c[pt_class(p)[0]] += L / n
    return {k: round(v * MM_PER_PT / 1000, 1) for k, v in c.items()}


def route_graph_from_json():
    strokes = []
    for sg in d['segments']:
        strokes.append(('r', [(g['x'], g['y']) for g in sg['geometry']]))
    return strokes


def manual_strokes():
    s = json.load(open(W + '00_arch_ground_floor_w_rooms_route_manual.strokes.json'))
    out = []
    for x in s:
        col = {(33, 150, 243): 'blue', (255, 0, 0): 'red'}.get(tuple(x['color']))
        if col:
            out.append((col, [tuple(p['p']) for p in x['pts'] if 'p' in p]))
    return out


# ---------- polygon boundary crossing ----------
def seg_inter(p, q, a, b):
    # intersection of segment pq with ab; returns point or None
    r = (q[0] - p[0], q[1] - p[1]); s = (b[0] - a[0], b[1] - a[1])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9:
        return None
    t = ((a[0] - p[0]) * s[1] - (a[1] - p[1]) * s[0]) / den
    u = ((a[0] - p[0]) * r[1] - (a[1] - p[1]) * r[0]) / den
    if 0 <= t <= 1 and 0 <= u <= 1:
        return (p[0] + t * r[0], p[1] + t * r[1]), u
    return None


def crossings(edges, rid):
    poly = room_poly(RM[rid])
    out = []
    for (p, q) in edges:
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            res = seg_inter(p, q, a, b)
            if res:
                pt, u = res
                # skip if an edge end sits on the boundary and is a terminal end
                if any(math.hypot(pt[0] - o[0], pt[1] - o[1]) < 8 for o in out):
                    continue
                out.append(pt)
    return out


def wall_info(pt, rid):
    """edge of room rid nearest to pt: neighbour room, shared stretch, offset."""
    poly = room_poly(RM[rid])
    best = None
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L < 1e-6:
            continue
        t = max(0, min(1, ((pt[0] - a[0]) * (b[0] - a[0]) + (pt[1] - a[1]) * (b[1] - a[1])) / L ** 2))
        c = (a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]))
        dist = math.hypot(pt[0] - c[0], pt[1] - c[1])
        if best is None or dist < best[0]:
            best = (dist, i, a, b, L, t)
    dist, i, a, b, L, t = best
    ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    nx, ny = -uy, ux
    # outward normal: test with point-in-polygon
    mid = (a[0] + ux * L * t, a[1] + uy * L * t)
    def probe(k, s):
        return (mid[0] + k * nx * s, mid[1] + k * ny * s)
    k = 1
    if pip(probe(1, 3), poly):
        k = -1
    nb = None
    for s in (6, 12, 20, 30, 45):
        r = room_of(probe(k, s), rooms)
        if r and r['id'] != rid:
            nb = r
            break
    if nb is None:
        return {'edge_len_m': L * MM_PER_PT / 1000, 'nb': None}
    # shared stretch along edge
    n = int(L / 3)
    hit = []
    for j in range(n + 1):
        tt = j / n
        q = (a[0] + ux * L * tt, a[1] + uy * L * tt)
        ok = False
        for s in (6, 12, 20, 30, 45):
            r = room_of((q[0] + k * nx * s, q[1] + k * ny * s), rooms)
            if r and r['id'] != rid:
                ok = r['id'] == nb['id']
                break
        if ok:
            hit.append(tt)
    if not hit:
        return {'edge_len_m': L * MM_PER_PT / 1000, 'nb': nb['id']}
    lo, hi = min(hit) * L, max(hit) * L
    pos = t * L
    return {'edge_len_m': round(L * MM_PER_PT / 1000, 2), 'nb': nb['id'], 'nb_type': nb.get('roomTypeId'),
            'nb_name': nb['name'], 'stretch_m': round((hi - lo) * MM_PER_PT / 1000, 2),
            'pos_from_stretch_start_m': round((pos - lo) * MM_PER_PT / 1000, 2),
            'pos_from_stretch_end_m': round((hi - pos) * MM_PER_PT / 1000, 2),
            'frac': round((pos - lo) / max(1e-6, hi - lo), 2)}


def shortest_path(adj, src, dst):
    import heapq
    pq = [(0, src, None)]
    best = {}
    prev = {}
    while pq:
        dd, n, p = heapq.heappop(pq)
        if n in best:
            continue
        best[n] = dd; prev[n] = p
        if n == dst:
            break
        for m in adj[n]:
            if m not in best:
                heapq.heappush(pq, (dd + math.hypot(n[0] - m[0], n[1] - m[1]), m, n))
    if dst not in best:
        return None
    path = [dst]
    while prev[path[-1]] is not None:
        path.append(prev[path[-1]])
    return path[::-1]


def nearest_node(adj, pt, tol=8):
    b = None
    for n in adj:
        dd = math.hypot(n[0] - pt[0], n[1] - pt[1])
        if b is None or dd < b[0]:
            b = (dd, n)
    return b[1] if b and b[0] <= tol else None


def analyse(strokes, snap, label):
    edges = build_graph(strokes, snap)
    m = metrics(edges, label)
    adj = adj_of(edges)
    b90, b45 = bend_split(m)
    res = {'label': label, 'graph_edges': m['graph_edges'], 'length_m': round(m['length_m'], 1),
           'bends90': len(b90), 'bends45': len(b45), 'tees': len(m['tees']), 'crosses': len(m['crosses']),
           'ends': len(m['ends']),
           'bends_loc': loc_counts([n for n, t in m['bends']]), 'tees_loc': loc_counts(m['tees'] + m['crosses']),
           'length_by_class_m': length_by_class(edges)}
    # terminals matched
    unmatched = []
    tnode = {}
    for sid, pt in term_pts:
        n = nearest_node(adj, pt, 10)
        if n is None:
            c = stamps[sid]['transform']['position']
            n = nearest_node(adj, (c['x'], c['y']), 10)
        if n is None:
            unmatched.append(sid)
        else:
            tnode[sid] = n
    res['terminals_unmatched'] = unmatched
    # source
    src = nearest_node(adj, ahu_pt, 10)
    res['source_node'] = src
    # per room
    rows = []
    paths = {}
    if src:
        for sid, n in tnode.items():
            paths[sid] = shortest_path(adj, src, n)
    for rid in sorted(served, key=lambda x: int(x.split('-')[1])):
        ts = room_terms[rid]
        cr = crossings(edges, rid)
        # edges inside room
        inside_len = 0; inside_bends = 0; inside_tees = 0
        for n in adj:
            if pip(n, room_poly(RM[rid])):
                nb = adj[n]
                if len(nb) == 2 and turn(nb[0], n, nb[1]) > 5:
                    inside_bends += 1
                if len(nb) >= 3:
                    inside_tees += 1
        for a, b in edges:
            n = max(1, int(math.hypot(a[0] - b[0], a[1] - b[1]) / 5))
            L = math.hypot(a[0] - b[0], a[1] - b[1])
            for i in range(n):
                t = (i + 0.5) / n
                if pip((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), room_poly(RM[rid])):
                    inside_len += L / n
        # rooms traversed by paths of its terminals
        trav = set()
        for sid, pt in ts:
            p = paths.get(sid)
            if not p:
                continue
            for a, b in zip(p, p[1:]):
                L = math.hypot(a[0] - b[0], a[1] - b[1])
                k = max(1, int(L / 5))
                for i in range(k + 1):
                    t = i / k
                    q = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
                    c, r = pt_class(q)
                    if c == 'served' and r != rid:
                        trav.add(r)
        rows.append({'room': rid, 'name': RM[rid]['name'], 'type': RM[rid].get('roomTypeId'), 'terms': len(ts),
                     'crossings': [{'pt': r1(c), **wall_info(c, rid)} for c in cr],
                     'inside_len_m': round(inside_len * MM_PER_PT / 1000, 1), 'inside_bends': inside_bends,
                     'inside_tees': inside_tees, 'passes_through_other_served': sorted(trav)})
    res['rooms'] = rows
    res['chained_rooms'] = sum(1 for r in rows if r['passes_through_other_served'])
    res['multi_entry_rooms'] = sum(1 for r in rows if len(r['crossings']) > 1)
    res['rooms_with_bends'] = sum(1 for r in rows if r['inside_bends'] > 0)
    return res, edges, m


if __name__ == '__main__':
    man, medges, mm = analyse(manual_strokes(), True, 'manual')
    auto, aedges, am = analyse(route_graph_from_json(), False, 'auto')
    json.dump({'manual': man, 'auto': auto}, open(W + 'results.json', 'w'), indent=1, default=str)
    for r in (man, auto):
        print({k: v for k, v in r.items() if k != 'rooms'})
    # blue-only analysis
    bl = [(c, p) for c, p in manual_strokes() if c == 'blue']
    be = build_graph(bl, True)
    bm = metrics(be, 'blue')
    print('BLUE edges', len(be), 'len_m', round(bm['length_m'], 1), 'bends', bm['bends'], 'tees', bm['tees'], 'ends', bm['ends'], 'crosses', bm['crosses'])
    print('BLUE by class', length_by_class(be))
    print('BLUE tee loc', loc_counts(bm['tees'] + bm['crosses']))
