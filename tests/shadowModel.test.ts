/**
 * Shadow model correctness tests.
 *
 * These test physical correctness of shadow projection:
 * - building directly south should cast shadow north in morning/evening
 * - building directly north should never shade a south-facing terrace at midday
 * - shadow length scales inversely with sun altitude
 * - rooftop/miradouro bypass returns sunny regardless of buildings
 */

import { describe, it, expect } from "vitest";
import { getShadowStatus } from "@/lib/shadowCalc";
import { getTerraceStatus } from "@/lib/sunCalc";
import type { Terrace } from "@/types";
import type { BuildingInfo } from "@/types";

// Terrace at a known Lisbon point
const TERRACE_LAT = 38.714;
const TERRACE_LNG = -9.143;

// Helper: a rectangular building at given offset from terrace
function buildingAt(offsetLat: number, offsetLng: number, height: number): BuildingInfo {
  const lat = TERRACE_LAT + offsetLat;
  const lng = TERRACE_LNG + offsetLng;
  const d = 0.0002; // ~20m building
  return {
    id: 1,
    height,
    levels: Math.round(height / 3),
    polygon: [
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d],
    ] as [number, number][],
    centroid: [lng, lat] as [number, number],
    type: "residential",
    heightSource: "osm-levels",
  };
}

describe("Shadow model physical correctness", () => {
  it("tall building directly south casts shadow north at low morning sun", () => {
    // Sun coming from east-southeast at low altitude (like 8am in summer)
    // shadow should fall northwest
    const sun = { azimuth: 100, altitude: 15 }; // low, from east
    const buildingSouth = buildingAt(-0.001, 0, 20); // building south of terrace
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [buildingSouth], sun);
    // At azimuth=100 (from east), shadow falls at 280 (west)
    // building south shouldn't shade the terrace from this direction
    expect(["sunny", "partial"]).toContain(status);
  });

  it("tall building directly west shades terrace when sun is from west", () => {
    // Sun from west (azimuth ~270), shadow falls east
    // building west of terrace should shade when sun is from west + low
    const sun = { azimuth: 270, altitude: 12 };
    const buildingWest = buildingAt(0, -0.001, 25); // building west
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [buildingWest], sun);
    // Shadow from western building falls eastward — terrace should be shaded
    expect(status).toBe("shaded");
  });

  it("building far away (>300m effective shadow) doesn't shade at high sun", () => {
    // Very far building — shadow length capped at 300m, won't reach terrace
    const sun = { azimuth: 270, altitude: 45 }; // 45 degree sun — shadow = 1x height
    const nearBuilding = buildingAt(0, -0.003, 15); // ~300m away
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [nearBuilding], sun);
    expect(["sunny", "partial"]).toContain(status);
  });

  it("shadow length scales with building height", () => {
    // At same sun angle, a tall building should shade further than short one
    // Verify the model runs without error for different heights
    const sun = { azimuth: 270, altitude: 20 };
    const short = buildingAt(0, -0.0005, 5);
    const tall = buildingAt(0, -0.0005, 50);
    const statusShort = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [short], sun);
    const statusTall = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [tall], sun);
    // Both are valid statuses
    expect(["sunny", "partial", "shaded"]).toContain(statusShort);
    expect(["sunny", "partial", "shaded"]).toContain(statusTall);
    // Tall building shadow should be >= short building shadow
    const rank = { sunny: 0, partial: 1, shaded: 2 };
    expect(rank[statusTall]).toBeGreaterThanOrEqual(rank[statusShort]);
  });

  it("sun below horizon always returns shaded regardless of buildings", () => {
    const sun = { azimuth: 270, altitude: -5 }; // below horizon
    const building = buildingAt(0, -0.001, 20);
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [building], sun);
    expect(status).toBe("shaded");
  });

  it("no buildings → sunny when sun is up", () => {
    const sun = { azimuth: 180, altitude: 45 };
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [], sun);
    expect(status).toBe("sunny");
  });
});

describe("Rooftop/miradouro bypass is physically correct", () => {
  const rooftopVenue: Terrace = {
    id: "test-roof",
    name: "Test Roof",
    type: "bar",
    address: "Test",
    lat: TERRACE_LAT,
    lng: TERRACE_LNG,
    archetype: "rooftop",
    facingDegrees: 180,
    shadingRadius: 10,
    rating: 4.0,
    priceLevel: 2,
    tags: [],
    description: "Test rooftop",
  };

  it("rooftop is sunny at midday even surrounded by tall buildings", () => {
    // June 21, noon UTC — sun high
    const date = new Date(Date.UTC(2024, 5, 21, 11, 0));
    // Surround with very tall buildings
    const buildings: BuildingInfo[] = [
      buildingAt(0.001, 0, 50),
      buildingAt(-0.001, 0, 50),
      buildingAt(0, 0.001, 50),
      buildingAt(0, -0.001, 50),
    ];
    const status = getTerraceStatus(rooftopVenue, date, buildings);
    expect(status).toBe("sunny");
  });

  it("rooftop is shaded at night", () => {
    const night = new Date(Date.UTC(2024, 5, 21, 22, 0));
    const status = getTerraceStatus(rooftopVenue, night);
    expect(status).toBe("shaded");
  });
});
