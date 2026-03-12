# Sol de Lisboa — Data Source Research

Research conducted 2026-03-12.

## Data Source Evaluation

| Source | Available for Lisbon | Has Heights | Quality | Notes |
|--------|---------------------|-------------|---------|-------|
| OSM Overpass — venues | ✅ Yes | N/A | Good | 170 venues with `outdoor_seating=yes`; matched 24 of 30 by name |
| OSM Overpass — buildings | ✅ Yes | Partial | Good | 260 buildings near Noobai; 0% `building:height`, 48% `building:levels` |
| **Overture Maps** | ✅ Yes | Partial | Good | 18,774 buildings in central Lisbon; 3.4% have height, 20.9% have num_floors |
| WSF3D (DLR/NASA) | ✅ Yes | Yes (avg) | ~90m grid | GeoTIFF raster; neighborhood-level average building heights; CC-BY-4.0 |
| GHSL GHS-BUILT-H (EU JRC) | ✅ Yes | Yes (avg) | ~100m grid | Free global raster; similar to WSF3D; epoch 2018 |
| EUBUCCO | ✅ Yes | Yes (74-100%) | Individual buildings | Per-building heights for EU; no working API, country GPKG download |
| Microsoft ML Footprints | ✅ Yes | Partial | ML-derived | 174M global; per-building polygons + heights where available |
| OSMBuildings tile API | ❌ 403 Forbidden | Yes (partial) | N/A | Requires API key now; free tier no longer anonymous |
| Lisbon Open Data (dados.lisboa.pt) | ❌ DNS failure | Unknown | N/A | Portal unreachable; may have moved |
| DGT Portugal / SNIG | ⚠️ No results | No | N/A | Has LiDAR survey of Portugal but no open building height API |
| Open Topography LiDAR | ❌ No data | N/A | N/A | No LiDAR coverage for Lisbon in OpenTopography catalog |
| OSM Portugal building import | ❌ No import | N/A | N/A | No organized building height import exists for Portugal |
| Mapillary | ⚠️ Needs token | N/A | N/A | Skipped — requires API key |

## Recommended Approach (Updated)

**Building data**: OSM Overpass API for geometry + levels, enriched with **Overture Maps** height/floor data via DuckDB S3 query. Lisbon-specific floor height estimation: ground floor 4.2m (commercial) or 3.2m (residential), upper floors 3.0m each.

**Height data coverage after enrichment**:
- 5,283 total buildings across 30 venue areas
- 1,081 had OSM levels data (re-estimated with Lisbon-specific heights)
- 530 enriched from Overture Maps (69 with direct height, 461 with floor count)
- 3,672 buildings retain 15m default (no data from any source)
- **30.5% of buildings now have real height data** (up from ~20% with OSM alone)

**Shadow calculation**: Custom implementation using `suncalc` + `@turf/turf`. Algorithm:
1. Get sun position (azimuth, altitude) from SunCalc
2. For each nearby building, project its polygon in shadow direction
3. Check if terrace point falls within any shadow polygon

**Venue coordinates**: Updated 24 of 30 venues with real OSM coordinates. 6 remain with original/estimated coordinates (not found in OSM).

## OSM Venue Matches (24 of 30)

| Venue ID | OSM Name | OSM Lat | OSM Lng | Old Lat | Old Lng |
|----------|----------|---------|---------|---------|---------|
| noobai | Noobai | 38.7096 | -9.1480 | 38.7104 | -9.1487 |
| lost-in | Lost In | 38.7160 | -9.1460 | 38.7155 | -9.1475 |
| park-bar | Park Rooftop | 38.7112 | -9.1476 | 38.7118 | -9.1462 |
| pensao-amor | Pensão Amor | 38.7073 | -9.1437 | 38.7083 | -9.1440 |
| landeau | Landeau Chocolate | 38.7028 | -9.1787 | 38.7032 | -9.1770 |
| cafe-a-brasileira | A Brasileira | 38.7107 | -9.1420 | 38.7107 | -9.1424 |
| pavilhao-chines | Pavilhão Chinês | 38.7157 | -9.1468 | 38.7153 | -9.1485 |
| bettina-corallo | Niccolo & Bettina Corallo | 38.7173 | -9.1493 | 38.7167 | -9.1478 |
| cervejaria-trindade | Cervejaria Trindade | 38.7124 | -9.1424 | 38.7125 | -9.1427 |
| dear-breakfast | Dear Breakfast | 38.7096 | -9.1513 | 38.7091 | -9.1445 |
| pharmacia | Restaurante Pharmacia | 38.7101 | -9.1474 | 38.7110 | -9.1487 |
| quiosque-ribeira | Quiosque Ribeira das Naus | 38.7056 | -9.1415 | 38.7069 | -9.1411 |
| senhor-uva | Senhor Uva | 38.7145 | -9.1568 | 38.7101 | -9.1473 |
| topo-chiado | Topo Chiado | 38.7125 | -9.1400 | 38.7119 | -9.1399 |
| bistro-100-maneiras | Bistro 100 maneiras | 38.7121 | -9.1429 | 38.7130 | -9.1432 |
| portas-do-sol | Portas do Sol | 38.7127 | -9.1303 | 38.7128 | -9.1303 |
| chapito | Chapitô à Mesa | 38.7115 | -9.1339 | 38.7131 | -9.1316 |
| memmo-alfama | Memmo Alfama | 38.7103 | -9.1305 | 38.7108 | -9.1290 |
| cafe-garagem | Café da Garagem | 38.7149 | -9.1326 | 38.7138 | -9.1334 |
| quiosque-renatinho | Quiosque Príncipe Real | 38.7162 | -9.1479 | 38.7162 | -9.1505 |
| topo-martim-moniz | TOPO | 38.7168 | -9.1365 | 38.7155 | -9.1365 |
| timeout-market | Time Out Market Lisboa | 38.7071 | -9.1459 | 38.7068 | -9.1458 |
| silk-club | Silk Club | 38.7114 | -9.1428 | 38.7112 | -9.1441 |
| graça-esplanada | Esplanada Igreja da Graça | 38.7162 | -9.1315 | 38.7175 | -9.1303 |

## Venues NOT Found in OSM (6 of 30)

These venues are not present in OpenStreetMap and retain their original estimated coordinates:

| Venue ID | Name | Lat | Lng | Notes |
|----------|------|-----|-----|-------|
| rio-maravilha | Rio Maravilha | 38.7035 | -9.1775 | LX Factory; not in OSM |
| limao | Limão | 38.7038 | -9.1768 | LX Factory; not in OSM |
| espresso-largo | Café no Largo | 38.7115 | -9.1415 | Chiado; not in OSM |
| majong | Majong | 38.7123 | -9.1459 | Bairro Alto; not in OSM |
| jardim-dos-sentidos | Jardim dos Sentidos | 38.7175 | -9.1500 | Príncipe Real; not in OSM |
| bar-da-fábrica | Bar da Fábrica | 38.7030 | -9.1773 | LX Factory; not in OSM |

## Building Height Source Research (v2)

### Overture Maps (Primary enrichment source)
- **18,774 buildings** in central Lisbon bbox
- **3.4% with explicit height** (634 buildings, avg 13.5m)
- **20.9% with num_floors** (3,919 buildings, avg 4.23 floors)
- **22% have some vertical data**, 78% are bare footprints
- Data from OSM + Microsoft ML Buildings + Google Open Buildings
- Queried via DuckDB from `s3://overturemaps-us-west-2/release/2026-02-18.0/`

### WSF3D (DLR/NASA)
- Global building height raster at ~90m resolution
- GeoTIFF tiles available at `https://download.geoservice.dlr.de/WSF3D/files/tiles/`
- CC-BY-4.0 license
- Too coarse for individual buildings but useful as fallback for neighborhood averages

### GHSL GHS-BUILT-H (EU JRC)
- Similar to WSF3D: ~100m resolution global raster
- Free download from JRC FTP (redirects to Copernicus Emergency portal)
- Epoch 2018; good for validating neighborhood-level estimates

### EUBUCCO
- Individual building polygons with heights for all EU countries including Portugal
- 74-100% height coverage; available as GeoPackage on Zenodo
- No working API; requires full country download (~GBs)
- Best potential source for comprehensive per-building heights

### Microsoft ML Building Footprints
- Per-building polygons with ML-derived heights for 174M buildings globally
- Country-level GeoJSON downloads; Portugal included
- Height quality varies (ML-estimated, not surveyed)

### DGT Portugal
- Has conducted national LiDAR survey ("Levantamento LiDAR de Portugal Continental")
- Potentially highest resolution source but no open API or download found
- Manages SNIG (4,513 datasets) and SNIC (1.79M properties)

## Height Estimation Logic

For buildings with `building:levels` from OSM or `num_floors` from Overture:
- Ground floor: 4.2m (commercial/mixed) or 3.2m (residential/house)
- Upper floors: 3.0m each
- Example: 5-story commercial building = 4.2 + 4 × 3.0 = **16.2m**

For buildings without any level/height data: **15m default** (typical 5-story Lisbon building).

## OSM Building Data (Sample: Noobai Café area, 150m radius)

- **260 buildings** found
- **0%** have explicit `building:height` tags
- **48%** have `building:levels` tags (range: 2-6 levels)
- **0%** have generic `height` tags
- Building types: yes (127), apartments (74), residential (47), house (4), church (2), retail (2), hotel (1), school (1)
- Most buildings have full polygon geometry (lat/lng vertices) via `out body geom`

## NPM Package Assessment

| Package | Use Case | Decision |
|---------|----------|----------|
| suncalc | Sun position (azimuth, altitude) | Already installed |
| @turf/turf | Polygon operations (point-in-polygon, buffer, projection) | Installed |
| three.js | 3D rendering / raycasting | Overkill for 2D shadow check |
| @math.gl/sun | Alternative sun calc | Not needed, suncalc sufficient |

## Data Fetched and Cached

Building data fetched via Overpass API for all 30 venues (150m radius each). Saved to `src/data/buildings/`. Heights enriched from Overture Maps (530 buildings) and re-estimated with Lisbon-specific floor heights (1,081 buildings). Enrichment script: `src/scripts/enrichBuildingHeights.ts`.
