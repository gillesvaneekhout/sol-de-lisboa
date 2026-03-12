import { describe, it, expect } from "vitest";
import {
  distanceKm,
  priceLevelString,
  sunStatusColor,
  sortTerraces,
} from "@/lib/utils";
import type { TerraceWithStatus } from "@/types";

describe("distanceKm", () => {
  it("returns 0 for same point", () => {
    expect(distanceKm(38.716, -9.142, 38.716, -9.142)).toBe(0);
  });

  it("calculates reasonable distance between Lisbon landmarks", () => {
    // Praça do Comércio to Castelo de São Jorge — roughly 0.5-1km
    const dist = distanceKm(38.7075, -9.1364, 38.7139, -9.1334);
    expect(dist).toBeGreaterThan(0.3);
    expect(dist).toBeLessThan(2);
  });

  it("Lisbon to Porto is roughly 275km", () => {
    const dist = distanceKm(38.716, -9.142, 41.1579, -8.6291);
    expect(dist).toBeGreaterThan(250);
    expect(dist).toBeLessThan(300);
  });
});

describe("priceLevelString", () => {
  it("returns correct number of euro signs", () => {
    expect(priceLevelString(1)).toBe("€");
    expect(priceLevelString(2)).toBe("€€");
    expect(priceLevelString(3)).toBe("€€€");
    expect(priceLevelString(4)).toBe("€€€€");
  });
});

describe("sunStatusColor", () => {
  it("returns amber for sunny", () => {
    expect(sunStatusColor("sunny")).toBe("#FBBF24");
  });

  it("returns orange for partial", () => {
    expect(sunStatusColor("partial")).toBe("#FB923C");
  });

  it("returns grey for shaded", () => {
    expect(sunStatusColor("shaded")).toBe("#4B5563");
  });

  it("returns grey for unknown", () => {
    expect(sunStatusColor("unknown")).toBe("#4B5563");
  });
});

describe("sortTerraces", () => {
  const makeTerrace = (
    id: string,
    status: "sunny" | "partial" | "shaded",
    rating: number,
    lat: number
  ): TerraceWithStatus => ({
    id,
    name: id,
    type: "bar",
    address: "",
    lat,
    lng: -9.142,
    facingDegrees: 180,
    shadingRadius: 30,
    rating,
    priceLevel: 2,
    tags: [],
    description: "",
    sunStatus: status,
    nextSunnyTime: null,
    sunEndTime: null,
  });

  const terraces: TerraceWithStatus[] = [
    makeTerrace("shaded-low", "shaded", 3.0, 38.72),
    makeTerrace("sunny-mid", "sunny", 4.0, 38.716),
    makeTerrace("partial-high", "partial", 5.0, 38.71),
  ];

  it("sorts by sunny status first", () => {
    const sorted = sortTerraces(terraces, "sunny_now");
    expect(sorted[0].id).toBe("sunny-mid");
    expect(sorted[1].id).toBe("partial-high");
    expect(sorted[2].id).toBe("shaded-low");
  });

  it("sorts by rating descending", () => {
    const sorted = sortTerraces(terraces, "rating");
    expect(sorted[0].rating).toBe(5.0);
    expect(sorted[1].rating).toBe(4.0);
    expect(sorted[2].rating).toBe(3.0);
  });

  it("sorts by nearest when user location provided", () => {
    // User at 38.715, closest should be sunny-mid (38.716)
    const sorted = sortTerraces(terraces, "nearest", 38.715, -9.142);
    expect(sorted[0].id).toBe("sunny-mid");
  });
});
