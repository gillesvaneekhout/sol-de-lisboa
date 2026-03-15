# Sol de Lisboa — Evals

Updated: 2026-03-13

## What we evaluate
This project should improve against explicit checks, not vibes.

## Eval buckets

### 1. Dataset integrity
- all venue ids unique
- coordinates valid and within Lisbon bounds
- terrace coordinates valid when present
- coordinate source present
- terrace coordinate source valid when present
- descriptions and tags present

### 2. Source provenance
- distribution of `coordinateSource`
- distribution of `terraceCoordinateSource`
- distribution of building `heightSource`

### 3. Coverage quality
- number of venues
- number of venues with explicit terrace coordinates
- confidence distribution: high / medium / low
- weakest 10 venues by building-height coverage
- venues still fully dependent on default-estimate heights

### 4. Golden cases
Named venues that should remain directionally sane.

Examples:
- Portas do Sol: strong morning / midday behavior
- Ribeira das Naus: broad open exposure, especially afternoon
- PARK / TOPO / Silk: rooftop behavior should not act like a street canyon café
- LX Factory cluster: should remain explicitly lower-confidence until terrace truth improves

### 5. Regression check
A good change should improve one or more of:
- terrace provenance
- confidence distribution
- real-height coverage
- golden-case plausibility

And it should not silently make other parts worse.

## Run commands
- `npm run terraces:normalize`
- `npm run eval`
- `npm run eval:report`

## Rule of thumb
Don’t say "better" unless the eval report got better or a deliberate tradeoff was made explicit.
