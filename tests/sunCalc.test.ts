import { describe, it, expect } from "vitest";
import {
  getSunPosition,
  angleDifference,
  getTerraceStatus,
  findNextSunnyTime,
  isSunny,
} from "@/lib/sunCalc";
import type { Terrace } from "@/types";

// Lisbon coordinates
const LISBON_LAT = 38.716;
const LISBON_LNG = -9.142;

// Helper to create a date at a specific hour in Lisbon
function lisbonDate(year: number, month: number, day: number, hour: number, minute = 0): Date {
  // Create UTC date and adjust for Lisbon timezone (WET: UTC+0 in winter, UTC+1 in summer)
  // For testing, we use UTC directly — SunCalc handles position based on UTC
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  return d;
}

// A south-facing terrace with moderate building shading
const southFacingTerrace: Terrace = {
  id: "test-south",
  name: "Test South Terrace",
  type: "cafe",
  address: "Test",
  lat: LISBON_LAT,
  lng: LISBON_LNG,
  facingDegrees: 180, // facing south
  shadingRadius: 30,
  rating: 4.0,
  priceLevel: 2,
  tags: [],
  description: "Test terrace",
};

const westFacingTerrace: Terrace = {
  ...southFacingTerrace,
  id: "test-west",
  name: "Test West Terrace",
  facingDegrees: 270, // facing west
  shadingRadius: 30,
};

const eastFacingTerrace: Terrace = {
  ...southFacingTerrace,
  id: "test-east",
  name: "Test East Terrace",
  facingDegrees: 90, // facing east
  shadingRadius: 30,
};

const rooftopTerrace: Terrace = {
  ...southFacingTerrace,
  id: "test-rooftop",
  name: "Test Rooftop",
  facingDegrees: 180,
  shadingRadius: 10, // minimal shading (rooftop)
};

describe("angleDifference", () => {
  it("returns 0 for identical angles", () => {
    expect(angleDifference(180, 180)).toBe(0);
  });

  it("returns correct difference for simple cases", () => {
    expect(angleDifference(0, 90)).toBe(90);
    expect(angleDifference(90, 180)).toBe(90);
  });

  it("wraps around 360", () => {
    expect(angleDifference(10, 350)).toBe(20);
    expect(angleDifference(350, 10)).toBe(20);
  });

  it("maximum difference is 180", () => {
    expect(angleDifference(0, 180)).toBe(180);
    expect(angleDifference(90, 270)).toBe(180);
  });

  it("handles values over 360", () => {
    expect(angleDifference(370, 10)).toBe(0);
  });
});

describe("getSunPosition", () => {
  it("returns positive altitude during daytime in Lisbon", () => {
    // June 21 at noon UTC — sun should be high in Lisbon
    const noon = lisbonDate(2024, 6, 21, 12, 0);
    const pos = getSunPosition(LISBON_LAT, LISBON_LNG, noon);
    expect(pos.altitude).toBeGreaterThan(30);
  });

  it("returns negative altitude at night", () => {
    // 2 AM UTC in winter — definitely night in Lisbon
    const night = lisbonDate(2024, 1, 15, 2, 0);
    const pos = getSunPosition(LISBON_LAT, LISBON_LNG, night);
    expect(pos.altitude).toBeLessThan(0);
  });

  it("returns azimuth between 0 and 360", () => {
    const noon = lisbonDate(2024, 6, 21, 12, 0);
    const pos = getSunPosition(LISBON_LAT, LISBON_LNG, noon);
    expect(pos.azimuth).toBeGreaterThanOrEqual(0);
    expect(pos.azimuth).toBeLessThan(360);
  });

  it("sun is roughly south at solar noon in Lisbon", () => {
    // Solar noon in Lisbon in June is roughly 13:30 UTC+1 = 12:30 UTC
    const solarNoon = lisbonDate(2024, 6, 21, 12, 30);
    const pos = getSunPosition(LISBON_LAT, LISBON_LNG, solarNoon);
    // Should be roughly south (180°), within 30°
    expect(pos.azimuth).toBeGreaterThan(150);
    expect(pos.azimuth).toBeLessThan(210);
  });

  it("sun is in the east during morning", () => {
    // 8 AM UTC in June
    const morning = lisbonDate(2024, 6, 21, 8, 0);
    const pos = getSunPosition(LISBON_LAT, LISBON_LNG, morning);
    // Should be roughly east (45-135°)
    expect(pos.azimuth).toBeGreaterThan(30);
    expect(pos.azimuth).toBeLessThan(150);
  });

  it("sun is in the west during evening", () => {
    // 6 PM UTC in June
    const evening = lisbonDate(2024, 6, 21, 18, 0);
    const pos = getSunPosition(LISBON_LAT, LISBON_LNG, evening);
    // Should be roughly west (210-330°)
    expect(pos.azimuth).toBeGreaterThan(210);
    expect(pos.azimuth).toBeLessThan(330);
  });
});

describe("getTerraceStatus", () => {
  it("returns shaded at night", () => {
    const night = lisbonDate(2024, 6, 21, 1, 0);
    expect(getTerraceStatus(southFacingTerrace, night)).toBe("shaded");
  });

  it("returns shaded before sunrise", () => {
    const early = lisbonDate(2024, 1, 15, 5, 0);
    expect(getTerraceStatus(southFacingTerrace, early)).toBe("shaded");
  });

  it("south-facing terrace is sunny at midday in summer", () => {
    // Midday in Lisbon, sun is roughly south — south-facing terrace should get sun
    const midday = lisbonDate(2024, 6, 21, 12, 30);
    const status = getTerraceStatus(southFacingTerrace, midday);
    expect(["sunny", "partial"]).toContain(status);
  });

  it("east-facing terrace gets morning sun", () => {
    // Morning: sun in the east, east-facing terrace should be sunny
    const morning = lisbonDate(2024, 6, 21, 8, 0);
    const status = getTerraceStatus(eastFacingTerrace, morning);
    expect(["sunny", "partial"]).toContain(status);
  });

  it("west-facing terrace gets evening sun", () => {
    // Evening: sun in the west
    const evening = lisbonDate(2024, 6, 21, 18, 0);
    const status = getTerraceStatus(westFacingTerrace, evening);
    expect(["sunny", "partial"]).toContain(status);
  });

  it("west-facing terrace is shaded in the morning", () => {
    // Morning sun comes from east — west-facing terrace has building behind (east)
    const morning = lisbonDate(2024, 6, 21, 8, 0);
    const status = getTerraceStatus(westFacingTerrace, morning);
    expect(status).toBe("shaded");
  });

  it("rooftop terrace with minimal shading is sunny at midday", () => {
    const midday = lisbonDate(2024, 6, 21, 12, 30);
    const status = getTerraceStatus(rooftopTerrace, midday);
    expect(["sunny", "partial"]).toContain(status);
  });
});

describe("findNextSunnyTime", () => {
  it("returns null when checked at night", () => {
    // Late evening — no sun left
    const late = lisbonDate(2024, 6, 21, 22, 0);
    const next = findNextSunnyTime(southFacingTerrace, late);
    expect(next).toBeNull();
  });

  it("finds sunny time for south-facing terrace in the morning", () => {
    // Early morning — south-facing should get sun later in the day
    const early = lisbonDate(2024, 6, 21, 8, 0);
    const next = findNextSunnyTime(southFacingTerrace, early);
    // Should find a sunny time
    expect(next).not.toBeNull();
    if (next) {
      expect(next.getTime()).toBeGreaterThan(early.getTime());
    }
  });

  it("returns a date before 22:00", () => {
    const morning = lisbonDate(2024, 6, 21, 8, 0);
    const next = findNextSunnyTime(southFacingTerrace, morning);
    if (next) {
      expect(next.getUTCHours()).toBeLessThanOrEqual(22);
    }
  });
});

describe("isSunny (main export)", () => {
  it("returns a valid SunStatus", () => {
    const midday = lisbonDate(2024, 6, 21, 12, 0);
    const result = isSunny(southFacingTerrace, midday);
    expect(["sunny", "partial", "shaded"]).toContain(result);
  });

  it("is consistent with getTerraceStatus", () => {
    const time = lisbonDate(2024, 6, 21, 15, 0);
    expect(isSunny(southFacingTerrace, time)).toBe(
      getTerraceStatus(southFacingTerrace, time)
    );
  });
});
