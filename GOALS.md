# Sol de Lisboa — Goals

Updated: 2026-03-13

## Primary goal
Help someone in Lisbon choose a terrace with sun exposure that feels directionally right in the real world.

## Product principles
1. **Usefulness over fake precision**
   - Better to say "low confidence" than confidently lie.
2. **Terrace truth over venue truth**
   - The terrace point matters more than the business entrance.
3. **Scalable data model**
   - The system must grow from 30 venues to 100+ without manual chaos.
4. **Source provenance matters**
   - We should know what is OSM, curated, estimated, Overture, EUBUCCO, or fallback.

## MVP bar
- Core Lisbon venues behave plausibly across the day
- Confidence is visible in the UI
- Weak data is explicitly marked
- Adding new venues is a pipeline task, not a hand-editing mess

## Success criteria
### User-level
- A user can quickly find a terrace that is sunny now or soon
- Top suggestions feel believable for well-known Lisbon spots
- Low-confidence results are clearly signaled

### Data-level
- Venue and terrace coordinates are stored separately when needed
- Height source provenance is preserved
- Weakest venues are easy to identify and improve

### Engineering-level
- Dataset can be validated automatically
- Evals can be re-run after every improvement
- Regressions are easy to spot

## Known ceilings (accept and communicate, don't pretend away)
- OSM building height coverage in Lisboa: ~29% of buildings have real height tags. This is a city-wide OSM gap, not a data pipeline problem. Street venues in Chiado/Bairro Alto are naturally limited here.
- EUBUCCO Lisboa coverage: ~40k buildings but only ~3.6k usable rows after quality filtering. Adds ~8 buildings for us currently. Good for dense areas, thin elsewhere.
- Overture heights: 43 buildings enriched across all 30 venues. Good supplement, not a replacement.
- Rooftop + miradouro venues: shadow model deliberately bypassed — building heights don't matter when you're above the skyline.

## Non-goals
- Perfect physical simulation of Lisbon microclimate
- Full city-wide completeness before the product is useful
- Hiding uncertainty to make the UI look smarter
- Enriching past OSM data quality limits without a field survey

## What "good" looks like
If we add 50 new venues, the project should get busier, not messier.
