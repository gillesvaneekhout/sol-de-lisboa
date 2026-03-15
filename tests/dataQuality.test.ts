import { describe, expect, it } from "vitest";
import { getTerraceQuality } from "@/lib/dataQuality";
import type { Terrace, BuildingInfo } from "@/types";

const baseTerrace: Terrace = {
  id: "noobai",
  name: "Noobai",
  type: "cafe",
  address: "Lisbon",
  lat: 38.7,
  lng: -9.14,
  coordinateSource: "osm",
  facingDegrees: 180,
  shadingRadius: 30,
  rating: 4.2,
  priceLevel: 2,
  tags: [],
  description: "placeholder description",
};

function building(partial: Partial<BuildingInfo>): BuildingInfo {
  return {
    id: 1,
    height: 15,
    levels: null,
    polygon: [[-9.14, 38.7], [-9.1401, 38.7], [-9.1401, 38.7001]],
    centroid: [-9.14, 38.7],
    type: "yes",
    ...partial,
  };
}

describe("getTerraceQuality", () => {
  it("returns low confidence for estimated coordinates and default building heights", () => {
    const quality = getTerraceQuality(
      { ...baseTerrace, id: "rio-maravilha", coordinateSource: "estimated" },
      [building({}), building({ id: 2 })]
    );

    expect(quality.coordinateSource).toBe("estimated");
    expect(quality.confidence).toBe("low");
    expect(quality.heightCoverage).toBe(0);
  });

  it("returns medium/high confidence when coordinates are real and height coverage exists", () => {
    const quality = getTerraceQuality(baseTerrace, [
      building({ levels: 4, height: 13.2 }),
      building({ id: 2, height: 14 }),
      building({ id: 3 }),
    ]);

    expect(quality.coordinateSource).toBe("osm");
    expect(quality.buildingsWithMeasuredHeight).toBe(2);
    expect(quality.heightCoverage).toBeCloseTo(2 / 3, 3);
    expect(["medium", "high"]).toContain(quality.confidence);
  });
});
