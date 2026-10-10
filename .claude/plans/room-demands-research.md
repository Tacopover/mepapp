# Room-type demands and placement-rule calculation methods (research)

Date: 2026-10-10. Read-only research. No code changed.
Scope: early-design, per-room MEP calculations. Focus Netherlands / Europe, with US equivalents.

Marks used in this file:
- **[V]** = I checked the value against a source in this session.
- **[K]** = value from my own knowledge of the norm. It is widely quoted, but I did not check it against the norm text in this session.
- **[?]** = I am not sure. Check the norm before you ship the value as a default.
- **[P]** = design practice or rule of thumb. No norm gives this value.

Terms used in this file:
- **Demand**: a number that says what a room type needs, for example Em = 500 lx or 6.5 dm³/s per person. The number is independent of the product.
- **Capacity**: what one product (one stamp) gives, for example 3600 lm per luminaire or 50 dm³/s per grille.
- **Coverage**: a geometric limit for one product, for example "each point of the ceiling within 5.8 m of a detector".

---

## 0. Current code behaviour (read from the code)

Files: `packages/core/src/rooms/room-type.ts`, `placement-rule.ts`, `placement-layout.ts`, `room-values.ts`.

- `RoomType` has only `id`, `name`, `nameNl`, `keywords`, `areaPerPersonM2`. The file comment says "No design values: those differ per country."
- `RoomValues` (room-values.ts) gives: `areaM2`, `perimeterM`, min bounding rectangle (length, width, main axis), ceiling height (chain room > room type in the drawing > drawing > global, default 2700 mm), `volumeM3`, `people` (room value, else floor(area ÷ areaPerPersonM2)).
- `calculateRoomRequirement` computes: `required = fixed + perM2·A + perPerson·P + perM3·V (converted to the amount unit) + lighting`, at least `minimum`. Then `count = ceil(required ÷ capacityPerElement)`, or 1 without a capacity, then clamped by `minCount` / `maxCount`.
- Lighting: `E · A ÷ (UF · MF)` in lm. UF and MF are fixed numbers in the rule. The room index, the working-plane height and the mounting height are not used.
- Coverage (`preset: 'coverage'`): the layout gives the count. The coverage radius is `r = min(maxSpacing ÷ √2, maxWallDistance · √2, √(maxAreaPerElement ÷ 2))`. The start count is `ceil(A ÷ maxAreaPerElement)`. `layoutCoverage` adds stamps until each sample point is within r.
- All demand numbers live in the rule. So one rule fits only room types with the same demand. Example: Bbl gives 6.5 dm³/s per person for an office and 8.5 for a classroom. Today that needs two rules.

Findings in the shipped examples (`PLACEMENT_RULE_EXAMPLES`):
1. `example-toilet-exhaust` uses `fixed: 25, unit: 'dm³/s'`. The Bbl value is **7 dm³/s per toilet room** [V], which is about **25 m³/h**. The example probably mixes up m³/h and dm³/s. The example is 3.6 times the Bbl value.
2. `example-smoke-detector` uses `maxAreaPerElement 60, maxSpacing 7.5, maxWallDistance 3.5`. The code gives r = min(5.30, 4.95, 5.48) = 4.95 m. NEN 2535 Tabel 8 gives for a flat ceiling, room > 80 m², height ≤ 6 m: **A = 60 m², D = 5.8 m** [V]. D is the radius directly. The rule cannot hold D today. The maxWallDistance of 3.5 m makes the result stricter than the norm.

---

## 1. Lighting

### 1.1 Lumen method

| Item | Formula |
|---|---|
| Number of luminaires | N = Em · A ÷ (Φ · UF · MF) |
| Room index | k = L · W ÷ (h_m · (L + W)). For an irregular room: k = 2 · A ÷ (h_m · P) (the same value for a rectangle). |
| Height above the working plane | h_m = h_mount − h_wp. h_mount = ceiling height − suspension length (0 for recessed / surface). |
| Utilisation factor | UF = f(k, ρ_ceiling, ρ_wall, ρ_floor), from the photometric table of the luminaire (CIE 52 / LiTG method). Typical reflectances 0.7 / 0.5 / 0.2. |
| Maintenance factor | MF = LLMF · LSF · LMF · RSMF (CIE 97:2005). Typical LED in a clean office: 0.8 to 0.9 [P]. |
| Max spacing | s_max = SHR · h_m. SHR (spacing-to-height ratio) comes from the luminaire datasheet, typical 1.0 to 1.5 [P]. |

Symbols: Em = maintained average illuminance on the working plane, lx. Φ = luminous flux of one luminaire, lm. A = floor area, m². L, W = room length and width, m. P = perimeter, m.

Illustrative UF table for a recessed LED panel, reflectances 0.7/0.5/0.2 [P, illustrative only; a real rule must use the product table]:

| k | 0.6 | 0.8 | 1.0 | 1.25 | 1.5 | 2.0 | 2.5 | 3.0 | 4.0 | 5.0 |
|---|---|---|---|---|---|---|---|---|---|---|
| UF | 0.45 | 0.53 | 0.59 | 0.64 | 0.68 | 0.74 | 0.78 | 0.81 | 0.85 | 0.87 |

Effect: a corridor of 2 m × 20 m at h_m = 2.7 m has k ≈ 0.67. A large office of 15 m × 20 m has k ≈ 4.4. The UF differs by a factor of almost 2. A fixed UF in the rule gives a large error for corridors and small rooms.

### 1.2 EN 12464-1:2021 (NEN-EN 12464-1) requirements per room type

EN 12464-1 gives per task or activity: Em (maintained illuminance), Uo (uniformity = Emin ÷ Em), UGR_L (unified glare rating limit) and Ra (colour rendering). The 2021 edition also gives "modified" Em values (context modifiers raise Em one step) and Ez (cylindrical illuminance) and wall/ceiling values. The working-plane height is not fixed in the norm. The task area defines it. Practice: 0.75 m for desks (0.80 to 0.85 m in some NL projects), 0 m for corridors and floors [P].

| Room type | Em (lx) | Uo | UGR_L | Ra | Working plane | Mark |
|---|---|---|---|---|---|---|
| Office (writing, reading, data processing) | 500 | 0.60 | 19 | 80 | 0.75 m | [K] |
| Meeting / conference room | 500 | 0.60 | 19 | 80 | 0.75 m | [K] |
| Classroom | 500 (300 in EN 12464-1:2011 for primary/secondary day use) | 0.60 | 19 | 80 | 0.75 m | [K], 2021 change [?] |
| Lecture hall | 500 | 0.60 | 19 | 80 | 0.75 m | [K] |
| Corridor / circulation area | 100 | 0.40 | 28 | 40 | floor (0 m) | [K] |
| Stairs | 100 (150 in some tables) | 0.40 | 25 | 40 | floor | [?] |
| Entrance hall | 100 | 0.40 | 22 | 80 | floor | [K] |
| Toilets, washrooms, changing rooms | 200 | 0.40 | 25 | 80 | floor | [K] |
| Storage / stock room | 100 | 0.40 | 25 | 60 | floor | [K] |
| Canteen / pantry | 200 | 0.40 | 22 | 80 | 0.75 m | [K] |
| Commercial kitchen | 500 | 0.60 | 22 | 80 | 0.85–0.90 m | [K] |
| Plant room / switchgear room | 200 | 0.40 | 25 | 60 | floor | [K] |

Source: NEN-EN 12464-1:2021, Lighting of work places – Indoor work places, tables in clause 7 (offices, circulation areas, educational buildings, rest/sanitary rooms). Exact table references [?]. In NL the Arbobesluit art. 6.3 asks for adequate lighting. Practice refers to NEN-EN 12464-1.

US equivalent: IES Lighting Handbook (10th ed.) / ANSI/IES RP-1 (offices: about 300–500 lx on the task). ASHRAE 90.1 limits lighting power density (office about 6.5–8.5 W/m²) [K].

### 1.3 Emergency lighting (NEN-EN 1838, NEN-EN 50172)

| Situation | Requirement | Mark |
|---|---|---|
| Escape route (width ≤ 2 m) | ≥ 1 lx on the centre line, at the floor. At least 50 % of that value over the central band of half the route width. Max/min ≤ 40:1. | [K] |
| Open area / anti-panic | ≥ 0.5 lx on the floor, a 0.5 m border at the walls excluded. Max/min ≤ 40:1. | [K] |
| High-risk task area | ≥ 10 % of the normal Em, at least 15 lx. | [K] |
| Safety equipment, first aid, call points | ≥ 5 lx vertical at the equipment. | [K] |
| Exit sign viewing distance | l = Z · h. h = height of the pictogram. Z = 100 (externally lit), Z = 200 (internally lit). | [K] |

NL: Bbl requires emergency lighting on escape routes and in rooms for more than 75 persons [?, from Bouwbesluit 2012 art. 6.3; check the Bbl article]. Signs follow NEN 6088 and NEN-EN ISO 7010.
US: NFPA 101 §7.9: initial average 1 fc (10.8 lx), min 0.1 fc on the egress path [K].

The count of emergency luminaires does not follow from the lumen method. It follows from the spacing table of the product (spacing for 1 lx or 0.5 lx at a mounting height). That fits the coverage method with product values. Exit signs depend on doors and route direction changes, not on the room area. Room-based rules can only give "fixed per room" (for example 1 per room over 60 m²).

### 1.4 Split of inputs

| Input | Owner |
|---|---|
| Em, working-plane height, Uo, UGR_L (product choice), emergency mode (none / route 1 lx / open area 0.5 lx) | Room type |
| Φ per luminaire, UF table (k → UF) or fixed UF, MF, SHR, suspension length, spacing table for emergency | Placement rule (product) |
| A, P, L, W (min bounding rectangle), ceiling height | Room geometry |

---

## 2. Ventilation

### 2.1 Bbl (Besluit bouwwerken leefomgeving), new build, art. 4.122

Per-person capacity for a verblijfsgebied / verblijfsruimte (non-residential) [V, IPLO summary of Bbl art. 4.122]:

| Gebruiksfunctie | dm³/s per person |
|---|---|
| Onderwijsfunctie (education) | 8.5 |
| Kantoorfunctie (office) | 6.5 |
| Bijeenkomstfunctie (assembly, incl. childcare) | 6.5 |
| Sportfunctie | 6.5 |
| Industriefunctie | 6.5 |
| Gezondheidszorgfunctie, bed area | 12 |
| Gezondheidszorgfunctie, other | 6.5 |
| Logiesfunctie / celfunctie (cell unit) | 10 |
| Winkelfunctie (retail) | 4 |

Fixed and per-area capacities [V]:

| Room | Capacity |
|---|---|
| Woonfunctie verblijfsgebied | 0.9 dm³/s per m², at least 7 dm³/s |
| Woonfunctie verblijfsruimte | 0.7 dm³/s per m², at least 7 dm³/s |
| Toiletruimte | 7 dm³/s (= 25.2 m³/h) |
| Badruimte | 14 dm³/s (= 50.4 m³/h) |
| Kitchen / place for a cooking appliance | 21 dm³/s (= 75.6 m³/h) |
| Bijeenkomstfunctie for alcohol use | 3.8 dm³/s per m² [V; wording on source is ambiguous, check] |

Bbl counts the persons "for whom the room is designed". Bbl gives no default area per person for ventilation. The designer sets the number.
Note: earlier values in Bouwbesluit 2012 differed for some functions (for example assembly 4 dm³/s per person) [?]. Use the Bbl values.

Dutch schools: "Programma van Eisen Frisse Scholen 2021" classes A/B/C with CO2 limits about 800 / 950 / 1200 ppm absolute (A/B/C = 400 / 550 / 800 ppm above outdoor) [?].

### 2.2 NEN-EN 16798-1:2019 (European, "method 1": per person + per area)

q_tot = n · q_p + A · q_B (l/s). q_p = per person, q_B = building emissions per m².

| Category | q_p (l/s·person) | q_B very low polluting | q_B low polluting | q_B not low polluting | CO2 above outdoor (ppm) |
|---|---|---|---|---|---|
| I | 10 | 0.5 | 1.0 | 2.0 | 550 |
| II (normal, new build) | 7 | 0.35 | 0.7 | 1.4 | 800 |
| III | 4 | 0.2 | 0.4 | 0.8 | 1350 |
| IV | 2.5 | 0.15 | 0.3 | 0.6 | 1350 |

Mark: [K]. Source: EN 16798-1:2019 Annex B (tables B.6, B.7 and CO2 table). The current example rule (7 + 0.7) is category II, low polluting.

Default occupancy (EN 16798-1 Annex B / older EN 15251 Annex B) [K, check the table]: single office 10 m²/person, open-plan office 15 m²/person, meeting room 2 m²/person, auditorium 0.75, restaurant / canteen 1.5, classroom 2.0, kindergarten 1.9, department store 7.

Method 3 (EN 16798-1): from a CO2 limit: q = G ÷ (C_lim − C_out), with G = CO2 emission per person (about 18–20 l/h seated adult) [K]. Not needed at early design if per-person values are known.

### 2.3 Air changes per hour (ACH)

Q (m³/h) = n · V. Used when no per-person value applies: storage, technical rooms, toilets in some countries, labs. NL rules do not use ACH. Typical values [P]: storage 0.5–1, technical room 2–5 (or from heat load), toilet 5–10, kitchen extract 10–20.

### 2.4 ASHRAE 62.1-2022 (US) [K]

Vbz = Rp · Pz + Ra · Az.

| Space | Rp (l/s·p) | Ra (l/s·m²) | Default occupancy (p / 100 m²) |
|---|---|---|---|
| Office | 2.5 | 0.3 | 5 |
| Conference room | 2.5 | 0.3 | 50 |
| Classroom (age 9+) | 3.8 | 0.6 | 35 |
| Corridor | 0 | 0.3 | – |
| Storage room | 0 | 0.6 [?] | – |

Exhaust (table 6-4) [?]: public toilet 25 or 35 l/s per WC/urinal; kitchenette 1.5 l/s·m².

### 2.5 Terminal count

N = ceil(Q_room ÷ q_terminal). q_terminal is the capacity of a grille or diffuser at the acoustic limit (for example NR 35 / 35 dB(A)) and the throw. Both are product data. Throw / coverage can also limit the count: a diffuser covers about a square of side 2 × throw [P]. So a rule needs both: count = max(amount count, coverage count).

### 2.6 Split of inputs

| Input | Owner |
|---|---|
| Supply per person (dm³/s), supply per m² (dm³/s), exhaust fixed per room (dm³/s), ACH (when used), CO2 limit (info / sensor need) | Room type |
| Capacity per grille, diffuser coverage (throw), unit (dm³/s, m³/h) | Placement rule (product) |
| A, V, persons | Room geometry + room type |

---

## 3. Heating and cooling

Detailed heat loss: NEN-EN 12831-1 (with NL annex, ISSO 51 for dwellings, ISSO 53 for utility buildings). That needs U-values, façade, orientation and outdoor temperature. At early design the engineer uses W/m² values [P].

| Item | Formula |
|---|---|
| Heating load | Q_h = q_h · A (W) |
| Cooling load (simple) | Q_c = q_c · A, or Q_c = P · q_person + A · (q_light + q_equip) + solar |
| Terminal count | N = ceil(Q ÷ capacity of one terminal at the design temperatures) |

Typical values [P, ranges, not norms]:

| Room type | Heating setpoint (°C) | Cooling setpoint (°C) | Heating W/m² (new build) | Cooling W/m² |
|---|---|---|---|---|
| Office | 20–21 | 24–26 | 30–50 | 50–80 |
| Meeting room | 20–21 | 24–25 | 30–50 | 80–120 |
| Classroom | 20 | 25–26 | 30–50 | 60–100 |
| Corridor | 15–18 | none | 20–40 | none |
| Toilet | 18–20 | none | 30–50 | none |
| Storage | 10–15 | none | 10–30 | none |
| Kitchen / pantry | 18–20 | 26 | 20–40 | 40–80 (appliances) |
| Technical room | 5–15 (frost free) | ≤ 27–30 (server / switchgear) | 0–20 | from equipment heat |

EN 16798-1 Annex B (office, category II): operative temperature ≥ 20 °C in winter, ≤ 26 °C in summer. Category I: 21 / 25.5. Category III: 19 / 27 [K]. Internal gains [P]: seated person 70–75 W sensible; LED lighting 5–8 W/m²; office equipment 10–15 W/m².
US: ASHRAE 55 (comfort), ASHRAE Handbook Fundamentals ch. 18 (loads).

Split: setpoints and W/m² → room type. Terminal capacity (at a water temperature regime and setpoint) → placement rule. A → room. Façade length and orientation strongly change the real load. MepApp does not know the façade. Mark the W/m² value as a first estimate only.

---

## 4. Electrical

NEN 1010 (NL implementation of IEC 60364) sets safety rules for circuits. NEN 1010 gives no socket count for utility buildings [K]. For dwellings NEN 1010 has recommendations for a minimum number of socket outlets per room [?]. Counts in offices come from the client brief [P].

| Item | Typical value | Source |
|---|---|---|
| Data outlets | 1 work area per 10 m² of usable office floor, ≥ 2 telecom outlets per work area | NEN-EN 50173-2 / ISO/IEC 11801-2 [K] |
| Sockets per workplace (office) | 2 double sockets (4 points) per workplace | [P] |
| Meeting room | 1 floor box or table box + 2–4 double wall sockets | [P] |
| Classroom | 4–8 double sockets + front wall socket for the board | [P] |
| Corridor | 1 cleaning socket per 15–20 m corridor length | [P] |
| Toilet | 0–1 | [P] |
| Kitchen / pantry | 4–6 double sockets + dedicated points per appliance | [P] |
| Technical room | 2 double sockets | [P] |
| Small power density | office 10–15 W/m² (design 20–25 VA/m²) | [P] |
| Lighting power | LED office 5–8 W/m² | [P] |
| Wi-Fi access points | about 1 per 100–150 m² office, by coverage radius 10–15 m | [P] |
| Presence detectors | coverage by the detector range: ceiling PIR at 2.8 m about Ø 7–8 m for walking, Ø 4–5 m for seated presence | product data [P] |

Corridor sockets and linear items need a **per-length** amount (per metre of room length or of wall). The code has `perimeterM` and the min bounding rectangle length, but no rule amount per metre.

Split: sockets per person, data outlets per person, fixed sockets per room, sockets per m length → room type. Points per stamp (single / double = 1 or 2), detector range → placement rule.

---

## 5. Fire safety

### 5.1 Fire detection: NEN 2535 (NL), based on NEN-EN 54 products

NEN 2535 Tabel 8: max monitored area per detector A and max horizontal distance D from any point of the ceiling to the detector [V, VdS Nederland projectieblad NEN 2535, 2024]:

| Detector | Room area | Room height | Roof slope ≤ 15°: A / D | 15–30°: A / D | > 30°: A / D |
|---|---|---|---|---|---|
| Heat (NEN-EN 54-5) | ≤ 30 m² | max per Tabel 7 | 30 / 4.4 | 30 / 4.9 | 30 / 5.5 |
| Heat | > 30 m² | max per Tabel 7 | 20 / 3.6 | 30 / 4.9 | 40 / 6.3 |
| Smoke (NEN-EN 54-7) | ≤ 80 m² | ≤ 12 m | 80 / 6.7 | 80 / 7.2 | 80 / 8.0 |
| Smoke | > 80 m² | ≤ 6 m | 60 / 5.8 | 80 / 7.2 | 100 / 9.0 |
| Smoke | > 80 m² | 6–12 m | 80 / 6.7 | 100 / 8.0 | 120 / 9.9 |

- Two-detector or two-group dependency (for control of fire protection installations): A × 50 %, D × 70 % [V].
- Tabel 7, max room height: point heat detectors class A1 up to 7.5 m, other classes up to 6 m; point smoke detectors up to 12 m [V].
- Tabel 11: beam ceilings reduce A (one detector per 1 to 5 bays) [V].
- Min distance from a detector to a wall: 0.5 m (Figuur 20) [?].
- Exemptions: storage < 2 m² needs no detector under full coverage (NEN 2535 §10.2.2) [V]. Other exemptions (sanitary rooms, small shafts) exist only when there is no fire risk [?].
- Kitchens, pantries with steam or toasters: heat detector instead of smoke [P].
- The same table structure is in DIN VDE 0833-2 and CEN/TS 54-14 [K].
- Dwellings: NEN 2555 (smoke alarms, Bbl), at least one per floor on the escape route, in each bedroom since Bbl/2022 for new build [?].

International:
- BS 5839-1: smoke radius 7.5 m, heat radius 5.3 m. In corridors < 2 m wide: smoke spacing 15 m, heat 10.6 m [K].
- NFPA 72: smooth ceiling, smoke nominal spacing S = 30 ft (9.1 m). Each point within 0.7 · S = 21 ft (6.4 m). Distance to a wall ≤ S/2 [K]. Heat: listed spacing of the product.

Effect on the code: NEN 2535 gives A and D, and both depend on the **room area**, the **room height** and the roof slope. A fixed coverage set per rule fits only one band. The rule needs:
1. a direct radius input (D), next to max area and max spacing, and
2. optional bands: (room area range, ceiling height range) → (A, D). Default bands from Tabel 8 for flat ceilings.

### 5.2 Sprinklers: NEN-EN 12845 (NL also uses VAS / NEN 1073 for some systems)

| Hazard class | Max area per head | Max spacing between heads | Mark |
|---|---|---|---|
| LH (light hazard) | 21 m² | 4.6 m | [K] |
| OH (ordinary hazard 1–4) | 12 m² | 4.0 m | [K] |
| HHP / HHS (high hazard) | 9 m² | 3.7 m | [K] |

- Max distance from a head to a wall: 2.0 m for the standard layout [?]; min 2 m between heads [K].
- Typical classes (EN 12845 Annex A) [K]: offices and schools OH1 (LH only for small, limited areas); hotels, hospitals OH1; car parks OH2; storage areas OH3 or HH by storage height.

NFPA 13 [K]: light hazard 20.9 m² (225 ft²) per head, max 4.6 m (15 ft); ordinary 12.1 m² (130 ft²), 4.6 m; extra 9.3 m² (100 ft²), 3.7 m (12 ft). Wall distance ≤ S/2. Min 1.8 m (6 ft) between heads.

Split: hazard class → room type. Area and spacing per class → placement rule (a small table keyed by class). Coverage maps to the existing coverage method: maxArea = A, maxSpacing = S, maxWallDistance = wall limit.

### 5.3 Alarm sounders and voice alarm (NEN 2575 series, NEN-EN 54-3 / 54-23 / 54-24)

| Item | Value | Mark |
|---|---|---|
| Min sound level | ≥ 65 dB(A) in the area to alarm, and a margin above background noise | [K] for 65 dB(A); margin 5 dB (BS 5839) or 10 dB (NEN 2575) [?] |
| Sleeping rooms | ≥ 75 dB(A) at the bed head | [K] (BS 5839), NL [?] |
| Max level | ≤ 120 dB(A) | [K] |
| Coverage radius (free field) | r = 10^((L_1m − L_req) ÷ 20) m. L_1m = sound level of the sounder at 1 m (product). | physics; walls and doors reduce it |
| Visual alarm devices | EN 54-23 coverage volume, for example "C-3-15" = ceiling, 3 m height, 15 m cube | [K] |

Practice: at least 1 sounder per room that people use, plus coverage for large rooms [P]. Voice alarm loudspeakers: coverage by spacing (about 2 × ceiling height for ceiling speakers) and STI ≥ 0.50 [P].

### 5.4 Split of inputs

| Input | Owner |
|---|---|
| Detector type (smoke / heat / none), sprinkler hazard class, required sound level (dB(A)) | Room type |
| A / D bands, sprinkler area and spacing per class, sounder level at 1 m, wall offset | Placement rule (product + norm) |
| A, ceiling height, roof slope (not in the room model today) | Room geometry |

---

## 6. Plumbing

### 6.1 Number of fixtures (NL)

| Rule | Value | Mark |
|---|---|---|
| Bbl: non-residential functions | ≥ 2 toilet rooms, except when ≤ 15 persons use 1 toilet room | [V, secondary source] |
| Bbl: persons per toilet room | max 30 (new build), max 45 (existing) | [V, secondary source] |
| Urinals | may replace up to 25 % of required toilets | [V, secondary source] |
| Arbobesluit / Arbo practice | 1 toilet per 15 employees of the same gender; gender separation from 10 employees at the same time | [V, secondary source; article [?]] |
| Washbasin | 1 in or near each toilet room; 1 per 4 WCs/urinals in groups | [V, secondary source] |
| Accessible toilet | floor 1.65 × 2.2 m | [V, secondary source] |

Sources: leever.nl summary of Bbl / Bouwbesluit; the exact Bbl article numbers [?].
International: UK BS 6465-1, US IPC Table 2902.1 (office: 1 WC per 25 for the first 50 persons, then 1 per 50) [K].

The fixture count is a **building or floor** calculation (all persons served by a toilet group). It is not a per-room calculation. Per room, the useful rule is "fixed per room" (1 WC + 1 washbasin per toilet room). A building-level check (persons on the floor ÷ toilet rooms) is a separate report, not a placement rule.

### 6.2 Drainage and water supply

- NEN-EN 12056-2 (drainage): Q_ww = K · √ΣDU. DU (system I, NL): WC 2.0–2.5, washbasin 0.5, shower 0.6, urinal 0.5, kitchen sink 0.8. K = 0.5 (dwelling, office), 0.7 (school, hospital, restaurant), 1.0 (frequent use) [K].
- NEN 1006 / NEN-EN 806-3 (water supply): loading units (LU): washbasin 1, WC cistern 1, shower 2, kitchen sink 2 [K].
- These values size pipes. They do not change the number of stamps. Store DU / LU on the stamp definition (product), not on the room type.

---

## 7. Other items

- Acoustics: no direct element count. Grille / diffuser capacity at an NR / dB(A) limit is product data. The room type can hold a sound limit (for example 35 dB(A) office, 30–35 dB(A) classroom per Frisse Scholen / Bouwbesluit [?]) as information for product choice.
- CO2 / presence sensors: 1 per room or by coverage [P].
- Room thermostats: fixed 1 per room or zone [P].

---

## 8. Proposed room-type demand fields

Principle: the room type holds **demands** (what the room needs). The placement rule holds **products and methods** (how one stamp fulfils the demand). The room holds **geometry**. A rule reads a demand field by name, so one rule serves all room types. A room or a rule can still override a value.

Keep `areaPerPersonM2`. All new fields are optional. Absent = the rule cannot use this demand for the room (warning, as `noPeople` today).

| Field | Unit | Used by |
|---|---|---|
| `areaPerPersonM2` (exists) | m²/person | persons |
| `illuminanceLx` | lx (Em) | lighting |
| `workingPlaneHeightM` | m | lighting (room index) |
| `uniformityUo` | – | info / check |
| `ugrLimit` | – | info / product choice |
| `emergencyLighting` | 'none' \| 'route' \| 'openArea' | emergency lighting rule filter |
| `supplyPerPersonDm3s` | dm³/s·person | ventilation |
| `supplyPerM2Dm3s` | dm³/s·m² | ventilation |
| `exhaustFixedDm3s` | dm³/s per room | ventilation (toilet, bath, kitchen) |
| `airChangesPerH` | 1/h | ventilation (storage, technical) |
| `co2LimitPpm` | ppm | info / sensor rule |
| `heatingSetpointC` / `coolingSetpointC` | °C | info / terminal capacity choice |
| `heatingLoadWm2` / `coolingLoadWm2` | W/m² | heating / cooling terminals |
| `socketsPerPerson` | points/person | electrical |
| `socketsFixed` | points/room | electrical |
| `socketsPerM` | points/m length | electrical (corridors) |
| `dataOutletsPerPerson` | outlets/person | data |
| `fireDetector` | 'smoke' \| 'heat' \| 'none' | detection rule filter |
| `sprinklerHazard` | 'LH' \| 'OH1'..'OH4' \| 'HH' \| 'none' | sprinkler rule |

Typical defaults (NL new build, examples only; the user must check them) — legend: Bbl = [V]; EN 12464-1 / EN 16798-1 = [K]; the rest [P]:

| Field | Office | Meeting room | Classroom | Corridor | Toilet | Storage | Kitchen / pantry | Technical room |
|---|---|---|---|---|---|---|---|---|
| areaPerPersonM2 | 10 | 2 | 2 | – | – | – | – | – |
| illuminanceLx | 500 | 500 | 500 | 100 | 200 | 100 | 200 (pantry), 500 (prof. kitchen) | 200 |
| workingPlaneHeightM | 0.75 | 0.75 | 0.75 | 0 | 0 | 0 | 0.85 | 0 |
| uniformityUo | 0.60 | 0.60 | 0.60 | 0.40 | 0.40 | 0.40 | 0.40 / 0.60 | 0.40 |
| ugrLimit | 19 | 19 | 19 | 28 | 25 | 25 | 22 | 25 |
| emergencyLighting | openArea if > 60 m² [?] | openArea if > 60 m² [?] | openArea | route | none | none | none | none [?] |
| supplyPerPersonDm3s | 6.5 (Bbl); 7 (EN cat II) | 6.5 | 8.5 | – | – | – | – | – |
| supplyPerM2Dm3s | 0 (Bbl); 0.7 (EN cat II) | 0 / 0.7 | 0 / 0.7 | – | – | – | – | – |
| exhaustFixedDm3s | – | – | – | – | 7 (bath 14) | – | 21 | – |
| airChangesPerH | – | – | – | – | – | 0.5–1 | – | 2–5 |
| co2LimitPpm | 1200 (≈ 800 above outdoor) | 1200 | 950–1200 | – | – | – | – | – |
| heatingSetpointC | 20 | 20 | 20 | 18 | 18 | 15 | 18 | 10 |
| coolingSetpointC | 25 | 25 | 26 | – | – | – | – | 27 |
| heatingLoadWm2 | 40 | 40 | 40 | 30 | 40 | 20 | 30 | 0 |
| coolingLoadWm2 | 70 | 100 | 80 | – | – | – | 60 | equipment |
| socketsPerPerson | 4 | – | – | – | – | – | – | – |
| socketsFixed | – | 6 | 8 | – | 0 | 1 | 8 | 4 |
| socketsPerM | – | – | – | 1 per 15 m | – | – | – | – |
| dataOutletsPerPerson | 2 | – (fixed 2) | – (fixed 2) | – | – | – | – | – |
| fireDetector | smoke | smoke | smoke | smoke | none [?] | smoke (none < 2 m²) | heat | smoke |
| sprinklerHazard | OH1 | OH1 | OH1 | OH1 | OH1 | OH3 [?] | OH1 | OH1 |

---

## 9. Proposed placement-rule calculation methods

Mapping to the current presets:

| Current preset | Proposal | Reason |
|---|---|---|
| `fixed` | **Keep.** Add an option: amount = room type `exhaustFixedDm3s` (or another fixed demand field). | Toilet 7, bath 14, kitchen 21 dm³/s differ per room type. |
| `perArea` | **Keep.** Add the source option "from room type" (`supplyPerM2Dm3s`, `heatingLoadWm2`, `coolingLoadWm2`). | Heating and cooling W/m² are per room type. |
| `perPerson` | **Keep.** Add "from room type" (`supplyPerPersonDm3s`, `socketsPerPerson`, `dataOutletsPerPerson`). | Bbl 6.5 vs 8.5 per person. |
| `perPersonArea` | **Keep.** Add "from room type" for both terms. | EN 16798-1 method 1. |
| `airChanges` | **Keep.** Add "from room type" (`airChangesPerH`). | Storage / technical rooms. |
| `lighting` | **Change.** Em and working-plane height from the room type (rule override allowed). UF from k: compute k = 2A ÷ (h_m · P) with h_m = ceiling height − suspension − working-plane height, then interpolate a UF table in the rule (a fixed UF stays as a fallback). MF stays in the rule. Add SHR: s_max = SHR · h_m as a spacing limit. | A fixed UF gives large errors in corridors and small rooms. Em differs per room type. |
| `coverage` | **Change.** Add a direct radius `maxRadius` (NEN 2535 D, NFPA 0.7·S). Add optional bands keyed by room area and ceiling height (NEN 2535 Tabel 8). Warn when the ceiling height is over the detector limit (Tabel 7). Allow the limits to come from a class of the room type (sprinkler hazard → area / spacing). Fix the example rule values. | NEN 2535 gives A and D, not spacing / wall distance; values depend on room size. |
| `custom` | **Keep.** Add a per-metre term (`perM` with base = perimeter or room length). | Corridor sockets, linear grilles, perimeter heating. |
| (new) **Amount + coverage** | Count = max(amount count, coverage count). For example supply diffusers (flow ÷ capacity, and throw), luminaires (lumen count, and SHR spacing), emergency luminaires (spacing table only). | Today `coverage` and amount presets exclude each other. |
| (new, optional) **Per length** | Amount = a · L (room length from the min bounding rectangle) or a · P (perimeter). | Can be a field of `custom` instead of a new preset. |
| (new, optional) **Sound coverage** | r = 10^((L_1m − L_req) ÷ 20), then the coverage method with that radius. L_req from the room type. | Alarm sounders. Can wait; "fixed 1 per room" + coverage covers most cases. |

Out of scope for room-based rules (state this in the UI or the plan):
- Exit signs (depend on doors and route direction).
- Toilet / washbasin counts per number of persons (a building or floor calculation).
- Detailed heat loss (needs façade, U-values, orientation).
- Drainage DU and water LU (pipe sizing, product data on the stamp).

Data model change in short:
1. `RoomType` gets an optional `demands` object with the fields in section 8.
2. `PlacementAmount` terms get a source: a number in the rule, or a room-type demand field name.
3. `LightingInputs`: `lux` optional (default: room type), new `workingPlaneHeightM`, `suspensionM`, `ufTable` (k → UF pairs), `shr`.
4. `CoverageLimits`: new `maxRadius`, optional `bands` (room-area / height ranges), coverage usable together with an amount.

---

## Sources

- IPLO, Ventilatie: regels bij nieuwbouw (Bbl art. 4.122): https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/ventilatie/
- Handel Bouwadvies, Ventilatieberekening Bbl, eisen en tabellen: https://www.handelbouwadvies.nl/bouwbesluitberekeningen/ventilatieberekening/ventilatieberekening-besluit-bouwwerken-leefomgeving-eisen-en-tabellen/
- VdS Nederland, Projectieblad NEN 2535 (Tabel 7, 8, 10, 11), version 2024-02: https://vds-nederland.nl/wp-content/uploads/2024/03/Bbl-VdS-Nederland-BV-I-Projectieblad-2535-I-Versie202401-I.pdf
- BVM Groep, NEN 2535 exemption for storage < 2 m²: https://bvmgroepnederland.nl/vraag-van-de-week/welke-opslagruimte-hoeft-conform-nen-2535-niet-te-worden-voorzien-van-een-automatische-melder-bij-volledige-bewaking/
- Brafon, Bewakingsomvangen van brandmeldinstallaties: https://brafon.nl/kennispublicatie-bewakingsomvangen-van-brandmeldinstallaties/
- Leever, Wettelijke eisen aan het aantal toiletruimten: https://www.leever.nl/wettelijke-eisen-gesteld-aan-het-aantal-toiletruimten/
- IPLO, Bad- en toiletruimte nieuwbouw: https://iplo.nl/regelgeving/regels-voor-activiteiten/technische-bouwactiviteit/nieuwbouw/rijksregels/bad-toiletruimte/
- Norms cited from knowledge, not opened in this session: NEN-EN 12464-1:2021, NEN-EN 1838, NEN-EN 50172, NEN 6088, NEN-EN ISO 7010, NEN-EN 16798-1:2019, EN 15251, NEN-EN 12831-1, ISSO 51/53, NEN 1010, NEN-EN 50173-2, NEN-EN 54 series, NEN 2555, NEN 2575, NEN-EN 12845, NEN-EN 12056-2, NEN-EN 806-3, NEN 1006, CIE 52, CIE 97:2005, ASHRAE 62.1-2022, ASHRAE 55, NFPA 72, NFPA 13, NFPA 101, BS 5839-1, IPC.
