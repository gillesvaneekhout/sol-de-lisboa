# Terrace Coordinate Data Sources Assessment

Assessed: 2026-03-14

## Goal
Evaluate external data sources for obtaining terrace-specific coordinates (not just venue entrance points) to improve shadow calculation accuracy.

---

## 1. OSM Overpass API

**What it gives:** POI nodes/ways with tags including `outdoor_seating=yes`. Some venues have building footprint ways. Rare: separate terrace polygon geometry via `leisure=outdoor_seating` or `outdoor_seating=terrace`.

**Terrace-specific coords?** Almost never. The `outdoor_seating` tag is typically a boolean on the main venue node — no separate terrace polygon. Only ~24 separate terrace polygons exist across all of Lisbon.

**Automation potential:** HIGH for confirming outdoor seating exists; LOW for terrace geometry.

**Test results (5 venues):**

| Venue | In OSM? | outdoor_seating tag? | Terrace polygon? |
|-------|---------|---------------------|-------------------|
| espresso-largo | No | No (nearby Caffe di Marzano has it) | No |
| cervejaria-trindade | Yes (node 3435703642) | No | No |
| pavilhao-chines | Yes (node 2501889503) | No | No |
| majong | No | No | No |
| carpe-diem-arte | No | No | No |

**Lisbon-wide stats:**
- 413 amenities with `outdoor_seating=yes` in greater Lisbon (38.70–38.78, -9.20–-9.10)
- 156 in central Lisbon
- 42 are ways (but these are building outlines with the tag, not terrace outlines)
- ~24 actual terrace polygons (`leisure=outdoor_seating` or `outdoor_seating=terrace`)

**Coverage of our 47 venues:** Only 2 of 5 tested venues even exist in OSM. Based on the 413 tagged venues in Lisbon, we'd expect maybe 10–15 of our 47 to have the tag, and essentially 0 to have terrace-specific geometry.

**Recommendation:** Use Overpass to bulk-confirm which venues have outdoor seating (useful for validation), but don't rely on it for terrace coordinates. The ~24 terrace polygons are too sparse to be useful at scale.

---

## 2. Google Maps Places API

**Skipped** — no API key available.

Likely gives: venue point coordinates, photos, opening hours. Does NOT provide terrace-specific geometry. Would be entrance/building center only.

---

## 3. Foursquare Places API

**Skipped** — no API key available.

Similar to Google: point coordinates for the venue, not terrace-specific geometry.

---

## 4. Mapillary

**What it gives:** Street-level imagery with AI-detected map features (signs, poles, road markings). Coverage exists in Lisbon.

**Terrace-specific coords?** No. Mapillary's detection taxonomy is oriented toward road infrastructure (traffic signs, utility poles, lane markings). There are no built-in classes for chairs, tables, umbrellas, or outdoor dining areas.

**API key required?** Yes — OAuth 2.0 or developer token required for all API access.

**Automation potential:** VERY LOW. Would require:
1. Fetching street-level photos near each venue
2. Running a custom CV model to identify outdoor seating areas
3. Triangulating 3D terrace coordinates from multiple images

This is a significant ML engineering effort with uncertain results. Not practical for this project.

**Recommendation:** Not viable as a data source. Useful only for manual visual verification of terrace locations.

---

## 5. Overture Maps (buildings + places)

**What it gives:**
- **Buildings theme** (already in use): Building footprint polygons with height and num_floors. We use this via `enrichFromOverture.ts` for building height enrichment.
- **Places theme**: 64M+ POIs worldwide as point geometry with name, category, confidence, contact info.

**Terrace-specific coords?** No. The places schema has no fields for outdoor_seating, terrace area, or terrace geometry. Geometry is strictly Point — no polygon representation.

**Automation potential:** N/A for terrace coordinates. Already maximally used for building heights.

**Recommendation:** Continue using buildings theme for heights. Places theme has no terrace data to offer.

---

## Summary Matrix

| Source | Terrace Geometry | Venue Confirmation | Automation | Recommended Use |
|--------|------------------|--------------------|-----------|-----------------|
| OSM Overpass | ~24 polygons in Lisbon (rare) | Yes (413 venues tagged) | High | Bulk validation only |
| Google Places | No | Yes | High (needs key) | Skip unless key obtained |
| Foursquare | No | Yes | High (needs key) | Skip unless key obtained |
| Mapillary | No (would need custom CV) | Visual only | Very low | Not viable |
| Overture Maps | No | Yes (point only) | High | Already used for heights |

## Recommendation for Scaling to 500 Venues

**No external API provides terrace-specific coordinates at scale.** The best approach is:

1. **Satellite/aerial imagery + manual pinning** — remains the most reliable method for terrace coordinates. Use the `terraceCoordinateSource: "curated"` workflow.

2. **Semi-automated with LLM assistance** — feed satellite imagery crops to a vision model to suggest terrace polygon boundaries, then human-verify. This could 3-5x the pinning throughput.

3. **OSM Overpass as validation layer** — query `outdoor_seating=yes` to confirm venues have outdoor seating, filter candidates, and catch data entry errors.

4. **Venue photos (Google/Foursquare)** — if API keys are obtained, photos can help identify terrace orientation and size for manual coordinators, but won't give coordinates directly.

The bottleneck is and will remain manual terrace coordinate curation. The LiDAR shadow schedules already handle the hard part (accurate shadow computation); what's needed is accurate terrace point placement, which no public API provides automatically.
