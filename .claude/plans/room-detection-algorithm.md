# Room detection algorithm (round 3 FINAL, run F1)

Input: Float64Array `segs`, 8 numbers per segment: x0, y0, x1, y1 (page pt), width, spare, kind flags, path id.
kind & 3: 0 = straight line, 1 = line, 2 and 3 = flattened curve piece. kind & 4 = piece of a closed subpath.
Also input: `mm` = millimetres per pt (page scale), page bounds, seed point (pt), optional label area.
Output: polygon (or mask), area in m2, flags { touchesRoiBorder, leak, sharedFill }.
Source: RS/pipe.mjs (filter), RS/room.mjs (fill). All lengths below are in mm and converted with `mm`.

## A. Wall filter (buildKeep) -> keep flag per segment
1. Pair rule (straight lines only, length >= stubMinMm=150). Bin by angle (1 degree bins, neighbours checked).
   Two lines are partners when: angle difference <= angTolDeg=1.0; perpendicular distance in [minGapMm=15, maxWallMm=500];
   overlap along the line >= min(minOverlapMm=400, 0.6 * shorter length) and >= min(200, 0.6 * shorter length).
2. A line is "paired" when the partner overlaps cover >= coverFrac=0.1 of its length.
3. Hatch drop: paired line with >= hatchPartners=5 partners and length < hatchMaxLenMm=600 is not kept.
4. Keep paired lines with length >= minLenMm=250 ("long"). Keep paired lines 150..250 mm ("stubs") only if an endpoint lies within stubTouchMm=60 of a long kept line.
5. Curve rule: cut each curve subpath (same path id, kind&3 > 1) into chords of about curveChordMm=500 (skip chords < 0.4 of that).
   A chord is kept when another chord has angle difference <= curveAngTolDeg=12, distance in [15, 500], overlap >= curveOverlapFrac=0.4 of the shorter chord.
   Keep all pieces of a kept chord.
6. Loop rule (furniture): group closed-subpath segments by path id; find the oriented bounding box (long side w, short side h).
   Candidate when (w < furnMaxMm=1500 and h > furnMinMm=150 and w/h < furnAspect=3.0) or (h > furnThickMm=600 and w < furnBigMaxMm=4500).
   A candidate stays (column in a wall) when kept wall endpoints touch (within bridgeTouchMm=80) two opposite sides. Otherwise drop all its segments.
7. Stair rule (new in round 3). Use kept straight lines with length in [stairMinLenMm=600, stairMaxLenMm=3500]. Bin by rounded angle (degrees), sort by perpendicular offset d.
   Build a chain: next line has offset step in [stairMinPitchMm=150, stairMaxPitchMm=400], along-axis overlap >= 0.8 of the shorter length,
   length ratio >= stairLenRatio=0.8, and (from the third line) step within 20 percent of the chain mean pitch. Take the first fit.
   A chain with >= stairMinSteps=4 lines is a stair: drop all its lines.
   Box cleanup (stairBox=true), only when chain span (d last - d first) <= stairBoxMaxSpanMm=3600. Also drop other kept lines that are:
   (a) parallel to the treads, offset in [d first - 0.6 pitch, d last + 0.6 pitch], along-overlap >= 0.8 of min(own length, tread length), and own length <= 1.25 * tread length + 200;
   (b) perpendicular stringers whose along position is within stairEndTolMm=60 of a tread end (median of tread ends), covering >= 0.8 of the chain span, length <= span + 1000.
   The two length caps stop the rule from removing real walls that share the line of a stair (found in 01_arch_first_floor).
8. Dash rule: kept pieces shorter than 3000 that lie on one line, form a run of >= dashMinRun=3 intervals with similar length (0.4..2.2 of median) and similar gaps: drop them (grid lines).
9. Component rule: rasterise kept lines at 50 mm/px, label 8-connected components of pixels with distance-to-line <= 1 px.
   Drop segments of components whose diagonal < max(minCompMm=1500, compFrac=0.05 * largest component diagonal).

## B. Room fill (fillRoom), for a seed point
1. ROI = square of +-roiMm=50000 around the seed, clipped to the page. Rasterise kept lines, 1 px wide, at pxMm=33.3 mm/px -> `mask`.
2. `d` = exact Euclidean distance transform (px) to the nearest mask pixel. r = gapMm/2/pxMm = 15 px (gapMm=1000 closes door gaps up to 1 m).
3. Anchor = nearest non-mask pixel to the seed (square-ring search). Auto seed: breadth-first search from the anchor through non-mask pixels within seedRadiusMm=3000;
   choose the pixel with the largest d (moves the seed off text, furniture and door swings). If d <= r, use the nearest pixel with d > r.
4. Flood fill (4-neighbour) over pixels with d > r. Record touchesRoiBorder when the fill reaches the raster edge.
5. Grow back: r steps of dilation (alternate 4-neighbour and 8-neighbour), only into non-mask pixels.
6. Wall grow (new): round(wallGrowMm=100 / pxMm) = 3 steps of 4-neighbour dilation into mask pixels next to the fill (fill reaches the wall centre line).
7. fillHoles=true: pixels not reachable from the raster border without crossing the fill are added (islands such as columns and furniture inside the room).
8. Area = pixel count * pxMm^2 / 1e6. Polygon = contour of the fill mask (not built in the study; the study measures area only).

## C. Flags (evaluated post hoc in the study; leak rule not wired into fillRoom)
- OPEN/leak: fill touches the ROI border, or area > 1.3 * label area (label known), or two seeds give the same fill (area difference < 0.3 m2).
  On the 24 study rooms: ratio > 1.3 flags exactly the 8 OPEN rooms; shared fill flags 4 of them; no non-OPEN room is flagged. touchesRoiBorder flags none (all fills stay inside the ROI).

## Timings (Node 20, one core)
Filter: 0.35 s (5k segments) to 3.3 s (Example_2, 40k+ segments; pair rule 1.7 s, component rule 1.5 s). Fill: 0.35 to 1.6 s per room (raster + distance transform dominate).

## Known limits
- Rooms with no closed wall in the drawing (open plan, glazed edge) leak: 8 of 24 study rooms. Only the flags above detect this.
- Example_2 #1 (stair with thin outline, 0.47): the room border is a single thin outline and landing lines stay inside; the fill covers about half.
- 00_arch_ground_floor #0 (0.68): a table and desk block that touch the walls survive the filter and cut out about 12 m2. Furniture touching walls is not solved.
- Stair rule is tuned on 5 files. Chains of 4+ equal parallel lines with pitch 150-400 mm (for example curtain wall mullions, hatch) can be dropped. In 00_arch_ground_floor the rule drops 540 lines (not checked line by line).
- wallGrowMm=100 and the label match are calibrated on these labels. If labels use the finish face, use about 33 mm.
- gapMm=700 gave a better median (0.049) but leaked in 01_arch_first_floor. pxMm=20 also leaked there. Do not lower either without a gap check.
- Scale per file is manual here. The port needs the page scale (drawing calibration in @mepapp/core).
- Example_1 text is outlines, so its 4 label areas were read by hand.


## Round 4 additions (run R4-1 default, R4-7 optional hatch rule)
Changed since F1:
1. fillRoom, param `seedClosed` (default false in code, true in the recommended set): the auto seed search starts at the nearest pixel with d > r and walks only through pixels with d > r inside seedRadiusMm. F1 walked through every non-wall pixel, so it left small rooms through door gaps (0.30, 0.31 gave 338 m2). Result: 00 extras 0.30 0.82, 0.31 0.48. Regression set unchanged (14 of 16, median 0.023). Example_1 #3 (OPEN) changes 2.59 -> 0.20.
2. Optional filter rule (`hatchEvidence`, default false), parameters:
   - hatchTickMaxMm=900, hatchMinAngDeg=20: a tick is a line piece of up to 900 mm that crosses the band between two paired lines at 20 degrees or more, midpoint between 5 and 95 percent of the gap.
   - Density = ticks per metre of overlap, maximum over the partners of a line. hatchMinDens=15 (real hatch 40-45 per m, chair lines 8 per m). hatchThinMm=150 (a pair closer than this counts as a thin wall).
   - A paired line is rejected (reason 10) when no partner is hatched or thin. Exceptions: length >= hatchExemptLenMm=3000; pen width < hatchRejMinW=0.3; collinear continuation (hatchRunAngDeg=5) of a supported line end within hatchTouchMm=80; hatchBridge=true: both ends touch a supported line.
   - Applies only if the hatched share of long paired metres >= hatchStyleFrac=0.35 (00: 0.42, 01: 0.40, Examples: 0.19-0.28). This margin is thin (5 files).
   - Effect (R4-7): 00#0 0.68 -> 0.93, extras 5 of 5 within 15 percent, but 01#1 0.96 -> 1.24 and the 01 OPEN rooms leak to the outside. Not the default.
3. Diagnostics: buildKeep returns `reason` per segment (1 short or not a line, 2 no partner, 3 hatch, 4 stub untouched, 5 unpaired curve, 6 loop, 7 stair, 8 dash, 9 component, 10 no hatch evidence). Tools: reasonpng.mjs, diag4.mjs, diag5.mjs, diag6.mjs, partners.mjs, hstats.mjs.
Facts learned: partition walls in the A0 plans are two 0.36 pt lines 127 mm apart (5a5a5a) with c0c0c0 ticks (127 mm) between, in 4 phases, 40-45 ticks per metre. Tables are polylines paired with chair lines (500 mm long, 180-231 mm away).
Timings (filter, one core): R4-1 same as F1 (Example_1 3.2 s, Example_2 1.4 s, Example_3 1.5 s, 00 0.6 s, 01 0.5 s). With hatchEvidence: 00 1.1 s, 01 0.5 s, Example_1 4.2 s, Example_2 3.5 s, Example_3 2.6 s.
