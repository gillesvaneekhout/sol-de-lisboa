import { test, expect } from "@playwright/test";

test.describe("Terrace Sun Tracker", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Store errors for the no-JS-errors test
    (page as unknown as Record<string, string[]>)._jsErrors = errors;
  });

  test("page loads without JS errors", async ({ page }) => {
    const errors = (page as unknown as Record<string, string[]>)._jsErrors;
    expect(errors).toEqual([]);
  });

  test("map container is visible with non-zero dimensions", async ({ page }) => {
    const map = page.locator('[data-testid="map-container"]');
    await expect(map).toBeVisible({ timeout: 10000 });
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test("time slider exists and is interactive", async ({ page }) => {
    const slider = page.locator('[data-testid="time-slider"]');
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute("type", "range");

    // Get initial value, change it, verify it changed
    await slider.fill("720"); // Set to 12:00
    const newValue = await slider.inputValue();
    expect(newValue).toBe("720");
  });

  test("list view toggle works", async ({ page }) => {
    // Should start on map view
    const mapBtn = page.locator('[data-testid="view-map"]');
    const listBtn = page.locator('[data-testid="view-list"]');
    await expect(mapBtn).toBeVisible();
    await expect(listBtn).toBeVisible();

    // Click list view
    await listBtn.click();
    await page.waitForTimeout(300);

    // Verify list content appears (venue cards)
    const venueCards = page.locator("button:has(h3)");
    const count = await venueCards.count();
    expect(count).toBeGreaterThan(0);

    // Switch back to map
    await mapBtn.click();
    await page.waitForTimeout(300);
    const map = page.locator('[data-testid="map-container"]');
    await expect(map).toBeVisible();
  });

  test("at least one venue marker exists on the map", async ({ page }) => {
    // Wait for map and markers to render
    await page.waitForTimeout(2000);

    // Leaflet circle markers are rendered as SVG circles
    const markers = page.locator(".leaflet-interactive");
    const count = await markers.count();
    expect(count).toBeGreaterThan(0);
  });

  test("filter pills are visible and functional", async ({ page }) => {
    const filterBar = page.locator('[data-testid="filter-bar"]');
    await expect(filterBar).toBeVisible();

    // All filter pills should be visible
    const allFilter = page.locator('[data-testid="filter-all"]');
    const sunnyFilter = page.locator('[data-testid="filter-sunny"]');
    await expect(allFilter).toBeVisible();
    await expect(sunnyFilter).toBeVisible();

    // Click sunny filter
    await sunnyFilter.click();
    await page.waitForTimeout(300);

    // Click back to all
    await allFilter.click();
    await page.waitForTimeout(300);
  });

  test("venue sheet opens when clicking a marker", async ({ page }) => {
    // Wait for markers to render
    await page.waitForTimeout(2000);

    // Click the first marker
    const marker = page.locator(".leaflet-interactive").first();
    await marker.click();
    await page.waitForTimeout(500);

    // Venue sheet should appear
    const sheet = page.locator(".bottom-sheet");
    await expect(sheet).toBeVisible();

    // Should have sun summary
    const sunSummary = page.locator('[data-testid="sun-summary"]');
    await expect(sunSummary).toBeVisible();
  });

  test("favorites persist across interactions", async ({ page }) => {
    // Switch to list view
    await page.locator('[data-testid="view-list"]').click();
    await page.waitForTimeout(300);

    // Find a favorite button and click it
    const favoriteBtn = page.locator('button[aria-label="Add to favorites"]').first();
    await favoriteBtn.click();
    await page.waitForTimeout(200);

    // Verify it changed to "Remove from favorites"
    const removeBtn = page.locator('button[aria-label="Remove from favorites"]').first();
    await expect(removeBtn).toBeVisible();

    // Filter by saved
    await page.locator('[data-testid="filter-saved"]').click();
    await page.waitForTimeout(300);

    // Should have at least one card
    const cards = page.locator("button:has(h3)");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });
});
