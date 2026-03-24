# Sol de Lisboa — Production Readiness Audit

## Mobile UX Checklist

### Touch Targets (minimum 44x44px per Apple HIG)
- [x] Map markers — 14-18px dots, but with padding in container
- [ ] Filter pills — need larger touch area
- [ ] Time slider thumb — 22px, should be 44px
- [ ] Now button — small, needs larger tap target
- [ ] View toggle (Map/List) — okay
- [ ] Close button on venue sheet — 32px, needs 44px

### Safe Areas
- [x] Top header respects notch (top-4)
- [x] Bottom slider respects home indicator (bottom-4)
- [ ] Venue sheet should respect bottom safe area

### Gestures
- [x] Swipe to close venue sheet (added with Framer Motion)
- [ ] Pull to refresh on list view
- [ ] Pinch to zoom on map (native MapLibre)

### Typography
- [ ] Minimum font size 16px for body text (prevents iOS zoom)
- [ ] Line height 1.5 minimum for readability
- [ ] Font weights consistent

### Responsive Breakpoints
- [ ] Test on iPhone SE (375px)
- [ ] Test on iPhone 14 Pro Max (430px)
- [ ] Test on iPad

### Accessibility
- [ ] VoiceOver labels on all interactive elements
- [ ] Color contrast ratios (WCAG AA: 4.5:1)
- [ ] Reduce motion support
- [ ] Focus indicators

## Security Checklist

### Input Validation
- [x] Time slider bounded (8am-10pm)
- [x] Date picker — standard HTML input
- [ ] Geolocation — validate coordinates in bounds

### Data Handling
- [x] No PII collected
- [x] Favorites stored in localStorage only
- [x] No API keys exposed (all map tiles are public/free)
- [ ] Add CSP headers

### Third-Party Dependencies
- [ ] Audit npm packages for vulnerabilities (`npm audit`)
- [ ] Pin dependency versions
- [ ] Review MapLibre GL license

### Performance
- [ ] Bundle size optimization
- [ ] Image optimization
- [ ] Code splitting
- [ ] Service worker for offline

## Code Scalability Checklist

### Architecture
- [x] Component-based structure
- [x] Separation of concerns (lib/ for utilities)
- [ ] State management — consider Zustand for complex state
- [ ] API layer abstraction (for future backend)

### Type Safety
- [x] TypeScript throughout
- [ ] Strict mode enabled
- [ ] No `any` types

### Testing
- [ ] Unit tests for sun calculations
- [ ] Component tests
- [ ] E2E tests for critical flows

### Error Handling
- [ ] Error boundaries
- [ ] Graceful degradation when WebGL fails
- [ ] Offline state handling

### Documentation
- [x] README
- [x] FEATURES.md
- [x] VIBE-CODING-UI.md
- [ ] Component documentation
- [ ] API documentation (for future)

## Priority Fixes

### P0 — Must Fix Before Launch
1. Touch target sizes (44px minimum)
2. Bottom safe area on venue sheet
3. npm audit fix
4. Error boundary

### P1 — Should Fix
1. Loading skeletons
2. Offline support
3. Accessibility audit
4. Performance optimization

### P2 — Nice to Have
1. Pull to refresh
2. Haptic feedback
3. Reduce motion support
