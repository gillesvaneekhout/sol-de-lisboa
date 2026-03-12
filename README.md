# ☀️ Sol de Lisboa — Lisbon Terrace Sun Tracker

A mobile-first PWA that shows bars, restaurants, and cafés in Lisbon with terraces, and tells you when they're in the sun.

## Setup

```bash
npm install
npm run dev      # development server at http://localhost:3000
npm run build    # production build
npm test         # run unit tests
```

## How the Sun Calculation Works

The app uses [SunCalc](https://github.com/mourner/suncalc) to compute the sun's position (azimuth and altitude) for any location and time.

Each terrace has two key properties:
- **facingDegrees** — compass direction the outdoor seating faces (0°=N, 90°=E, 180°=S, 270°=W)
- **shadingRadius** — how many degrees of sky the building behind the terrace blocks

The algorithm:
1. If sun altitude < 5° → **shaded** (sun too low or below horizon)
2. If the sun is behind the building (within `shadingRadius` degrees of the building's back) → **shaded** (unless sun is very high, then **partial**)
3. If the angle between sun azimuth and terrace facing < 45° → **sunny** (direct sunlight)
4. If the angle < 90° → **partial** (angled sunlight)
5. Otherwise → **shaded** (sun is behind the terrace)

## Tech Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS — mobile-first dark theme
- Leaflet + CartoDB dark tiles
- SunCalc for solar position calculations
- Vitest for unit tests
- PWA with service worker and offline support

## Dataset

30 real Lisbon terraces across Bairro Alto, Príncipe Real, LX Factory, Cais do Sodré, Alfama, Chiado, and Graça. Each venue has approximate facing direction based on actual street layout.
