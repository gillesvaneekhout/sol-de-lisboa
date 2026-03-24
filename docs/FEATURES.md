# Sol de Lisboa — Feature Roadmap & Monetization Ideas

## Current Features (v0.1)

### Core
- **47 curated venues** with terrace sun predictions
- **Real-time shadow visualization** — custom WebGL shader renders building shadows
- **Time slider** — see sun status at any time of day (8am-10pm)
- **Date picker** — plan ahead for any day
- **Filter pills** — Sunny / Partial / Shaded / Saved
- **Favorites** — save venues to your list (persisted to localStorage)
- **Venue details** — sun timeline, next sunny time, venue info
- **User location** — "go to my location" button

### Technical
- 38,597 building polygons with height data (OSM + Overture + EUBUCCO)
- SunCalc-based sun position calculations
- MapLibre GL JS with CARTO basemap (no API keys needed)
- Next.js 14 PWA, static export ready
- Mobile-first responsive design

---

## Planned Features (Next Sprint)

### 1. Custom Pin Locations
- Long-press/tap on map to drop a temporary pin
- See sun status at that exact location
- Option to save custom locations to your list
- Name your custom spots

### 2. Dark Mode Shadow Visibility ✅ Done
- Lighter shadow tint for dark backgrounds
- Better contrast on night mode maps

### 3. Production Polish
- [ ] Loading states and skeleton screens
- [ ] Error boundaries
- [ ] Offline support (PWA cache)
- [ ] iOS PWA "Add to Home Screen" prompt
- [ ] Performance optimization (lazy load buildings by viewport)
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Analytics (privacy-respecting, e.g., Plausible)

---

## Monetization Ideas

### Free Tier (Users)
- All current features
- Basic venue info
- Unlimited favorites
- Shadow visualization

### Premium Tier (Users) — "Sol Pro" €2.99/month or €19.99/year
- Custom pin locations (more than 5 saved)
- Sun alerts: "Your saved spot will be sunny in 30 minutes"
- Week-ahead forecasts
- Historical sun data ("best time to visit X last month")
- Export sun calendar to Google Calendar
- Ad-free experience

### Bar/Restaurant Tier — "Sol Business" €29/month or €249/year

#### Basic (Claim Your Listing)
- Verify ownership
- Update business hours
- Add photos
- Respond to tips/comments
- See analytics (views, saves)

#### Premium (Marketing & Promotions)
- **Happy hour promotions** — "☀️ Sun special: 2-for-1 on terrace drinks 3-5pm"
- **Featured placement** — appear first in sunny filters
- **Push notifications** — reach users when your terrace is sunny
- **Menu integration** — show prices, specials
- **Table reservations** — integrate with booking system
- **Sun guarantee badge** — "Best afternoon sun in Alfama"
- **Competitor insights** — see how you rank vs nearby venues

---

## Crowdsourcing Ideas

### User-Generated Content (Free Contributors)
- Submit new venues (moderated)
- Report closed/moved venues
- Upload terrace photos
- Rate "sun accuracy" after visits
- Add tips ("best seat is in the back corner")

### Gamification
- "Sun Hunter" badges for visiting sunny terraces
- Leaderboard for most venues visited
- Streaks for consecutive days
- Seasonal challenges ("Visit 10 miradouros this summer")

### Quality Control
- Minimum karma/visits required before submissions are trusted
- Community moderation
- Machine learning to detect spam/fake submissions
- Cross-reference with Google Maps/OSM data

---

## Expansion Ideas

### Geographic
- Porto (easy — same country, similar data sources)
- Barcelona, Madrid, Seville (Spain)
- European capitals with terrace culture
- Eventually: any city with OSM building data

### Partnerships
- Tourism boards
- Lonely Planet / Time Out
- Food delivery apps (outdoor dining filter)
- Event venues (outdoor weddings, corporate events)
- Real estate (apartment sun analysis)

### B2B
- API for real estate apps
- Hotel concierge integrations
- City tourism apps
- Event planning platforms

---

## Technical Debt / Quality

### Performance
- [ ] Virtual scrolling for venue list (100+ venues)
- [ ] Tile-based building loading (only load buildings in viewport)
- [ ] Web Worker for shadow calculations
- [ ] Service Worker for offline support

### Testing
- [ ] Unit tests for sun calculations
- [ ] Visual regression tests for shadow rendering
- [ ] E2E tests for critical user flows
- [ ] Performance benchmarks

### Infrastructure
- [ ] Vercel deployment
- [ ] Error monitoring (Sentry)
- [ ] Uptime monitoring
- [ ] CDN for static assets

---

## Notes

### Why Not Use ShadeMap API?
ShadeMap by Ted Piotrowski (shademap.app) is excellent, but their npm package requires a paid API key validated server-side. We built our own WebGL shadow renderer inspired by their approach — same quality, zero external dependencies.

### Data Sources
- Venues: Manually curated (Lisbon locals)
- Buildings: OpenStreetMap + Overture Maps + EUBUCCO
- Heights: OSM tags where available, default estimates elsewhere
- Sun position: SunCalc library (accurate to ~0.01°)

### Competition
- **SunCalc.org** — great for sun position, no venue discovery
- **Shadowmap.org** — beautiful shadows, no venue features
- **Terrace finder apps** — no sun prediction
- **Weather apps** — no shadow/terrace focus

We're the only app that combines venue discovery + shadow visualization + future prediction.
