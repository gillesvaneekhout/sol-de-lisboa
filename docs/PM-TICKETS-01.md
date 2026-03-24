# PM Ticket Queue — Sprint Fix (from QA Report #1)

## Prioritized by Impact × Effort

### 🔴 P0 — Fix Before Release

**NONE** — No blocking issues found

---

### 🟡 P1 — Fix This Sprint

#### TICKET-001: After-hours UX messaging
**Summary:** Show "Terraces are closed" when current time is outside 8am-10pm
**From:** QA BUG-001
**Impact:** High — Users will be confused at night
**Effort:** Small (1h)
**Acceptance Criteria:**
- [ ] If current time < 08:00 or > 22:00, show message "Terraces are closed. Check back tomorrow!"
- [ ] "Now" button disabled when outside hours
- [ ] Counter shows "0 sunny" with explanation
**Assigned:** Engineering

#### TICKET-002: Fix PWA icons
**Summary:** Add missing icon-192.png and icon-512.png
**From:** QA BUG-002
**Impact:** Medium — Blocks PWA install
**Effort:** Tiny (15min)
**Acceptance Criteria:**
- [ ] /icon-192.png exists and is valid PNG
- [ ] /icon-512.png exists and is valid PNG
- [ ] No console errors on load
**Assigned:** Engineering

---

### 🟢 P2 — Next Sprint

#### TICKET-003: "All" filter visual highlight
**Summary:** Highlight "All" button when selected
**From:** QA BUG-003
**Effort:** Tiny (10min)

#### TICKET-004: Update deprecated meta tag
**Summary:** Change apple-mobile-web-app-capable to mobile-web-app-capable
**From:** QA BUG-004
**Effort:** Tiny (5min)

#### TICKET-005: Default to dark mode
**Summary:** Respect system preference, default dark
**From:** QA UX-001
**Effort:** Small (30min)

#### TICKET-006: Venue sheet loading skeleton
**Summary:** Show skeleton while loading venue details
**From:** QA UX-002
**Effort:** Medium (1h)

---

## Sprint Allocation

**This Sprint:**
- TICKET-001 (1h) — After-hours UX
- TICKET-002 (15min) — PWA icons
- TICKET-004 (5min) — Meta tag
- TICKET-003 (10min) — All filter

**Total:** ~1.5h engineering work

**Next Sprint:**
- TICKET-005 — Dark mode default
- TICKET-006 — Loading skeleton

---

## Decision Log

| Decision | Rationale | By |
|----------|-----------|-----|
| After-hours shows closed message | Better than confusing sun predictions at night | PM |
| PWA icons as P1 | Required for App Store PWA submission | PM |
| Dark mode as P2 | Functional without, nice-to-have | PM |
