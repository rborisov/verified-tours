import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { offerFingerprint } from "./agent";

describe("offerFingerprint", () => {
  it("is stable for equivalent party packages", () => {
    const a = offerFingerprint({
      source: "Level.Travel",
      hotelId: "9070449",
      hotelName: "Mitos Apart Hotel",
      fromCity: "Nizhny Novgorod",
      startDate: "2026-08-02",
      nights: 7,
      adults: 2,
      childrenAges: "11, 14",
    });
    const b = offerFingerprint({
      source: "level.travel",
      hotelId: "9070449",
      hotelName: "Other Name",
      fromCity: "Nizhny Novgorod",
      startDate: "2026-08-02T00:00:00.000Z",
      nights: 7,
      adults: 2,
      childrenAges: "11,14",
    });
    assert.equal(a, b);
  });

  it("changes when nights differ", () => {
    const a = offerFingerprint({
      source: "level.travel",
      hotelName: "X",
      fromCity: "NN",
      startDate: "2026-08-02",
      nights: 7,
      adults: 2,
      childrenAges: "",
    });
    const b = offerFingerprint({
      source: "level.travel",
      hotelName: "X",
      fromCity: "NN",
      startDate: "2026-08-02",
      nights: 8,
      adults: 2,
      childrenAges: "",
    });
    assert.notEqual(a, b);
  });
});
