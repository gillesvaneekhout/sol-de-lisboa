# QA Report #1 — Sol de Lisboa

**Date:** 2026-03-24 00:30
**Build:** main @ 0f41681
**Environment:** localhost:3456 (dev)
**Tester:** Tito (QA Agent)

---

## Summary

Overall the app is functional and the UI is polished. Key features work well. Found 4 bugs, 2 UX improvements needed.

**Verdict:** Ready for review with minor fixes needed.

---

## ✅ What Works Well

### Map & Shadows
- [x] Map loads correctly with CARTO tiles
- [x] Shadow overlay renders (purple-tinted areas visible)
- [x] 47 venue markers displayed correctly
- [x] Yellow = sunny, gray = shaded markers
- [x] Location button present and styled correctly

### Venue Sheet
- [x] Opens with smooth spring animation
- [x] Displays venue name, type, price, rating
- [x] Sun timeline bar with color coding
- [x] "Sunny until X" / "Next sunny at X" messages
- [x] Data confidence section with metrics
- [x] Tags displayed (historic, coffee, tourist)
- [x] Favorite button works
- [x] Close button works
- [x] Backdrop blur when sheet is open

### Filters
- [x] All, Sunny, Partial, Shaded, Saved filters present
- [x] Filter pills have proper touch targets (44px)
- [x] View toggle (Map/List) works

### Time Controls
- [x] Time slider moves smoothly
- [x] Hour markers visible (8:00, 12:00, 16:00, 20:00)
- [x] Date picker works
- [x] "Now" button present

---

## 🐛 Bugs Found

### P1 — High Priority

#### BUG-001: "Now" button doesn't handle after-hours
**Steps:** Open app after 22:00 (10pm) and click "Now"
**Expected:** Show message like "Terraces closed" or "Come back tomorrow"
**Actual:** Clips to 08:00, shows sunny terraces as if it's morning
**Impact:** Confusing UX when app is used at night

#### BUG-002: Missing PWA icons cause console errors
**Steps:** Load app, check console
**Actual:** "Error while trying to use the following icon from the Manifest: /icon-192.png"
**Impact:** PWA install experience degraded

### P2 — Medium Priority

#### BUG-003: Filter "All" button not visually highlighted
**Steps:** Load app (All is selected by default)
**Expected:** "All" button should be highlighted
**Actual:** "All" appears same as other inactive filters

#### BUG-004: Apple mobile-web-app-capable meta tag deprecated
**Steps:** Check console warnings
**Actual:** `<meta name="apple-mobile-web-app-capable">` deprecated warning
**Fix:** Use `<meta name="mobile-web-app-capable">`

---

## 💡 UX Improvements Needed

### UX-001: Dark mode should be default
Currently loads in light mode. Most users expect dark mode for a "sun tracker" app at night.
**Suggestion:** Default to dark mode, or respect system preference

### UX-002: Add loading skeleton for venue sheet
When clicking a marker, there's a brief moment where the sheet is empty before data populates.
**Suggestion:** Show skeleton/shimmer while loading venue details

---

## 📊 Test Coverage

| Feature | Tested | Status |
|---------|--------|--------|
| Map load | ✅ | Pass |
| Shadow render | ✅ | Pass |
| Venue markers | ✅ | Pass |
| Venue sheet open | ✅ | Pass |
| Venue sheet close | ✅ | Pass |
| Swipe to close | ⏳ | Not tested (browser limitation) |
| Time slider | ✅ | Pass |
| Date picker | ✅ | Pass |
| Filters | ✅ | Pass |
| Favorites | ✅ | Pass |
| Location button | ⏳ | Not tested (no GPS in browser) |
| List view | ⏳ | Not tested |
| Mobile touch targets | ✅ | Verified in code |

---

## Recommendations

### For PM (prioritization)
1. **Fix BUG-001** (after-hours handling) — Quick win, high impact
2. **Fix BUG-002** (PWA icons) — Needed for app store submission
3. **Address UX-001** (dark mode default) — User expectation

### For Engineering
1. Add night mode message when current time > 22:00 or < 08:00
2. Create PWA icons at /icon-192.png and /icon-512.png
3. Update meta tag to mobile-web-app-capable
4. Add visual highlight to active "All" filter

---

## Next QA Pass

After engineering addresses bugs, run:
1. Mobile device testing (real iPhone/Android)
2. PWA install flow
3. Offline mode
4. Performance profiling
