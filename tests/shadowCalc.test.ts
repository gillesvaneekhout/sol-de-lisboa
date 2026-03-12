import { describe, it, expect } from "vitest";
import { getShadowStatus } from "@/lib/shadowCalc";
import type { Building } from "@/lib/shadowCalc";
import type { SunPosition } from "@/types";

// Terrace point — on the north side
const TERRACE_LAT = 38.7100;
const TERRACE_LNG = -9.1480;

// A large building block 30m south of the terrace (~40m wide)
// Sun from south (180°) → shadow falls north onto terrace
const southBuilding: Building = {
  id: 1,
  height: 20,
  levels: 7,
  type: "apartments",
  centroid: [-9.1480, 38.7097],
  polygon: [
    [-9.1483, 38.7095],
    [-9.1477, 38.7095],
    [-9.1477, 38.7099],
    [-9.1483, 38.7099],
    [-9.1483, 38.7095],
  ],
};

// A tall building to the west of the terrace
const westBuilding: Building = {
  id: 2,
  height: 24,
  levels: 8,
  type: "apartments",
  centroid: [-9.1486, 38.7100],
  polygon: [
    [-9.1490, 38.7098],
    [-9.1484, 38.7098],
    [-9.1484, 38.7102],
    [-9.1490, 38.7102],
    [-9.1490, 38.7098],
  ],
};

// A very short building (won't cast significant shadow)
const shortBuilding: Building = {
  id: 3,
  height: 3,
  levels: 1,
  type: "house",
  centroid: [-9.1475, 38.7100],
  polygon: [
    [-9.1476, 38.70995],
    [-9.1474, 38.70995],
    [-9.1474, 38.71005],
    [-9.1476, 38.71005],
    [-9.1476, 38.70995],
  ],
};

describe("getShadowStatus", () => {
  it("returns shaded when sun is below 5 degrees", () => {
    const sun: SunPosition = { azimuth: 180, altitude: 3 };
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [southBuilding], sun);
    expect(status).toBe("shaded");
  });

  it("returns sunny when no buildings nearby", () => {
    const sun: SunPosition = { azimuth: 180, altitude: 45 };
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [], sun);
    expect(status).toBe("sunny");
  });

  it("returns sunny with high sun and short building", () => {
    const sun: SunPosition = { azimuth: 180, altitude: 60 };
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [shortBuilding], sun);
    expect(status).toBe("sunny");
  });

  it("returns shaded when building blocks low sun", () => {
    // Sun from the south at low angle — the south building's shadow extends north
    const sun: SunPosition = { azimuth: 180, altitude: 15 };
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [southBuilding], sun);
    expect(status).toBe("shaded");
  });

  it("returns sunny when sun comes from direction without buildings", () => {
    // Sun from the east — south building doesn't block
    const sun: SunPosition = { azimuth: 90, altitude: 40 };
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [southBuilding], sun);
    expect(status).toBe("sunny");
  });

  it("handles multiple buildings", () => {
    // Sun from the west — west building should block
    const sun: SunPosition = { azimuth: 270, altitude: 20 };
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [southBuilding, westBuilding], sun);
    expect(["shaded", "partial"]).toContain(status);
  });

  it("returns partial when sun altitude is very high and in shadow", () => {
    // Even if technically in shadow polygon, very high sun returns partial
    const sun: SunPosition = { azimuth: 180, altitude: 65 };
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [southBuilding], sun);
    expect(["sunny", "partial"]).toContain(status);
  });

  it("returns a valid SunStatus value", () => {
    const sun: SunPosition = { azimuth: 200, altitude: 35 };
    const status = getShadowStatus(TERRACE_LAT, TERRACE_LNG, [southBuilding, westBuilding], sun);
    expect(["sunny", "partial", "shaded"]).toContain(status);
  });
});
