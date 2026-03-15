# Sol de Lisboa — Data Source Research & Decision Doc

Updated: 2026-03-13

## What we are solving
We need reliable enough data to answer one user question:

**Which Lisbon terraces are sunny now, and how confident are we in that answer?**

That means we need 3 things:
1. **Venue truth** — where the terrace actually is
2. **Building truth** — nearby geometry + height data
3. **Prediction confidence** — how much of the answer is real data vs estimation

---

## Current conclusion
There is no single perfect source.

The best architecture is a **stack of complementary sources**:
- **OSM** as the open base layer for venues + building geometry
- **Overture Buildings** as the main open height/floor enrichment layer
- **EUBUCCO** as the best candidate for deeper per-building height coverage
- **WSF3D / GHSL** as coarse fallback layers
- **Google Places** as the strongest commercial complement for terrace / outdoor seating truth

This means the product should be built around **confidence-aware fusion**, not around one “magic” dataset.

---

## Source matrix

### 1) Venue / terrace sources

#### OpenStreetMap (OSM)
**Use for:** open venue discovery + outdoor seating indicators + geometry context

Relevant tags:
- `outdoor_seating=yes`
- `leisure=outdoor_seating`
- `amenity=restaurant`
- `amenity=cafe`
- `amenity=bar`

**Strengths**
- Open and free
- Excellent for base discovery
- Queryable via Overpass
- Gives us explicit terrace-related tagging in some cases

**Weaknesses**
- Coverage inconsistent
- Some real venues missing entirely
- Terrace position can still be approximate

**Decision**
- Keep as **primary open source** for venue discovery and matching
- Good enough for MVP seed dataset

---

#### Google Places API
**Use for:** validating venue existence and outdoor seating availability

Key field:
- `outdoorSeating` (Places API New; explicit field mask required)

**Strengths**
- Strong commercial source for place truth
- Explicit outdoor seating attribute
- Likely better recall than OSM for some venues

**Weaknesses**
- Paid
- Requires API key and field-mask discipline
- Not ideal as the only source of truth for geometry / terrace exact position

**Decision**
- Best **commercial complement**
- Worth testing as a second-pass validator / enrichment layer
- Not necessary for MVP if we stay curated, but very useful for scale-up

---

#### Overture Places
**Use for:** possible dedup / normalization layer for venue entities

**Strengths**
- Open and permissive
- Good broader place graph potential

**Weaknesses**
- Outdoor seating signal is less obvious than in OSM or Google Places
- Not clearly better than OSM for terrace-specific truth

**Decision**
- Not priority for current MVP
- Consider later for scaling / deduping

---

### 2) Building geometry + height sources

#### OpenStreetMap buildings
**Use for:** footprints + `building:levels` base layer

**Strengths**
- Open and queryable
- Good footprint coverage
- Gives some levels data

**Weaknesses**
- Explicit heights are sparse in Lisbon
- Coverage quality varies a lot by neighborhood

**Decision**
- Keep as **base geometry layer**
- Essential, but not enough by itself

---

#### Overture Buildings
**Use for:** main enrichment source for `height` and `num_floors`

Key attributes:
- `height`
- `num_floors`
- also building / building_part structure

**Strengths**
- Strongest open complement to OSM right now
- More useful vertical data than OSM alone
- Good fit for DuckDB / batch enrichment workflows

**Weaknesses**
- Still incomplete
- Coverage uneven
- Heights not universal

**Decision**
- Keep as **primary enrichment source** for MVP
- Best open option currently in practice

---

#### EUBUCCO
**Use for:** deeper per-building height enrichment in Europe

Data notes:
- EU-wide building dataset
- Portugal included
- Height coverage reported at large scale
- Available as GeoPackage / CSV
- Docs + downloads available through EUBUCCO

**Strengths**
- Most promising source for richer per-building European coverage
- More aligned with our real problem than coarse raster layers

**Weaknesses**
- Heavier to work with
- Not as quick to query as OSM / Overture
- Requires a proper local processing pipeline

**Decision**
- **Highest-value next source to test**
- Most likely source to materially improve low-confidence venues

---

#### WSF3D
**Use for:** coarse fallback height context

Data notes:
- ~90m resolution
- average building height / built-up statistics

**Strengths**
- Open
- Good broad fallback when nothing else exists

**Weaknesses**
- Too coarse for individual terrace precision
- Better for neighborhood context than building-level truth

**Decision**
- Use only as **fallback / sanity-check layer**
- Not suitable as primary building-height source

---

#### GHSL GHS-BUILT-H
**Use for:** coarse fallback and validation

Data notes:
- ~100m resolution
- global average building height layer

**Strengths**
- Open and easy to cite
- Good for large-scale validation

**Weaknesses**
- Too coarse for terrace-level predictions

**Decision**
- Same role as WSF3D: **fallback / benchmark**, not primary

---

#### Portugal-specific / OneGeo
**Use for:** potential future country-specific height layer

Current signal:
- OneGeo suggests Portugal-wide elevation / building height coverage is becoming available

**Strengths**
- Could become the strongest localized height source
- Country-specific data could beat global open layers

**Weaknesses**
- Commercial / evolving availability
- Needs actual technical validation, not just marketing claims

**Decision**
- Worth monitoring
- Not current MVP dependency

---

### 3) Shadow / sun sources

#### Our own shadow model
**Use for:** actual product logic

Current stack:
- `suncalc`
- building polygons
- projected shadows

**Strengths**
- Fully controllable
- Transparent
- Can evolve with our own confidence layer

**Weaknesses**
- Accuracy limited by input data quality

**Decision**
- Keep this as the core product engine

---

#### Shadowmap / external shadow products
**Use for:** benchmarking, not core dependency

**Strengths**
- Helpful as benchmark / inspiration

**Weaknesses**
- External dependency
- Not aligned with our goal of owning the logic and confidence model

**Decision**
- Use for comparison only if needed

---

## Recommended MVP architecture

### Venue layer
1. Curated venue list
2. Match against OSM first
3. Mark unmatched venues explicitly as estimated
4. Optionally validate with Google Places later

### Building layer
1. OSM footprints
2. Overture enrichment for height / floors
3. If still weak, test EUBUCCO on low-confidence zones
4. Use WSF3D / GHSL only as coarse fallback

### Prediction layer
1. Compute sun position with `suncalc`
2. Compute shadows from building polygons
3. Score confidence based on:
   - coordinate source
   - percentage of nearby buildings with real height data
   - future: rooftop / miradouro / courtyard heuristics

---

## What matters most now
The biggest product risk is **false precision**.

The app must not act like all predictions are equally trustworthy.

So the correct loop is:
1. show prediction
2. show confidence
3. improve the weakest venues first
4. repeat

---

## Priority next experiments

### P1. Test EUBUCCO against weakest venues
Goal:
- see if it materially improves building-height coverage for low-confidence venues
- especially LX Factory and other estimated / sparse-height areas

Reality check from metadata:
- Lisboa city id: `v0.1-PRT.12.7_1`
- ~40,669 total buildings
- ~3,588 with height data
- roughly **9% reported height coverage**

So EUBUCCO is still worth testing, but as a complement to Overture rather than a replacement.

Success criterion:
- clear improvement over Overture-only coverage

### P2. Test Google Places as terrace-validation layer
Goal:
- validate venue existence
- validate outdoor seating signal
- improve venue matching for missing / weak OSM records

Success criterion:
- helps recover or validate the currently estimated venues

### P3. Build confidence-aware ingestion pipeline
Goal:
- keep source provenance per venue and building
- avoid losing which values are real vs estimated

Success criterion:
- every venue answer can explain why it is high / medium / low confidence

---

## MVP decision
If we want to keep moving fast:

**MVP stack**
- curated venues
- OSM for venue matching + building footprints
- Overture for height enrichment
- confidence labels in app
- manual cleanup of low-confidence venues

**Next layer after MVP**
- EUBUCCO height experiment
- Google Places validation pass
- only then consider more advanced scaling

---

## Bottom line
The right approach is not “find one better data source.”

The right approach is:
- **OSM + Overture for MVP**
- **EUBUCCO as the main next test**
- **Google Places as the best terrace-truth complement**
- **confidence-aware UX from day one**

That gives us something honest, useful, and improvable.

---

## LiDAR Shadow Pipeline (MDS-50cm)

### What it does
Uses DGT's 50cm Digital Surface Model (MDS) tiles to compute per-venue shadow schedules via LiDAR-based ray casting. This replaces the building-polygon shadow model with actual measured surface elevation data that includes buildings, trees, walls — everything that blocks sunlight.

### Data source
- **DGT MDS-50cm** — Portuguese national 50cm resolution Digital Surface Model
- CRS: EPSG:3763 (ETRS89/PT-TM06)
- Tiles: 2000×2000 pixels (1000m × 1000m), Float32, nodata=-999
- STAC API: `https://cdd.dgterritorio.gov.pt/dgt-be/v1/collections/MDS-50cm/items/MDS-50cm-{tileId}-07-2024`
- Currently: 29 tiles covering central Lisbon (38 of 47 venues)

### How to run
```bash
# Install Python dependencies
pip3 install -r scripts/requirements.txt

# Process all venues
python3 scripts/process-lidar.py

# Process a single venue
python3 scripts/process-lidar.py cafe-a-brasileira

# Parallel processing (4 workers)
python3 scripts/process-lidar.py --parallel 4

# Force re-crop cached tiles
python3 scripts/process-lidar.py --force
```

### How to add a new venue
1. Add the venue to `src/data/terraces.json`
2. Ensure MDS tiles covering the venue location are in `data/mds-raw/`
3. Run `python3 scripts/process-lidar.py {venue-id}`
4. Shadow schedule written to `src/data/shadow-schedules/{venue-id}.json`

### How to download new tiles
Tile IDs encode grid position: `CCCRRR` where X = (CCC-200)×1000, Y = (RRR-300)×1000 in EPSG:3763. To find the tile ID for a venue, project its lat/lng to EPSG:3763 and compute `col = floor(x/1000) + 200`, `row = ceil(y/1000) + 300`.

### Coverage gaps
9 venues (mostly LX Factory and waterfront) need tiles 109194, 111194, 112194 which are just south of current coverage. These venues get fallback elevation and show no shadows.

### Algorithm
For each venue × hour (7-21) × month (1-12):
1. Get sun position (altitude, azimuth) via pysolar
2. Cast a ray from the terrace toward the sun at 0.5m intervals
3. If any MDS elevation sample along the ray exceeds the sun ray height → shaded
4. Observer height = MDS elevation at venue + 1m (or terraceFloor × 3m if set)

---

## References
- Google Places API data fields: `outdoorSeating`
- EUBUCCO docs and data portal
- Overture Maps buildings schema and guides
- DLR WSF3D dataset docs
- Copernicus / GHSL built height docs
- OneGeo releases / height coverage notes
- DGT MDS-50cm STAC catalog: `https://cdd.dgterritorio.gov.pt/dgt-be/v1/collections/MDS-50cm`
