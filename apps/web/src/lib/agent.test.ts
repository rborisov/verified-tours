import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTourSearchPrompt, offerFingerprint } from "./agent";

describe("buildTourSearchPrompt", () => {
  const sample = {
    jobId: "job-1",
    requestId: "req-1",
    adults: 2,
    childrenAges: "11, 14",
    fromCity: "Нижний Новгород",
    countries: "Турция, Марокко",
    departFrom: "2026-08-10",
    departTo: "2026-08-20",
    nightsMin: 7,
    nightsMax: 10,
    seaRequired: true,
    visaFreeOnly: true,
    preferHot: true,
    rawBrief: "Тихий отель у моря",
  };

  it("localizes for RF traveler and restricts to Russian OTAs", () => {
    const prompt = buildTourSearchPrompt(sample);
    assert.match(prompt, /гражданин РФ/);
    assert.match(prompt, /вылет ТОЛЬКО из России/);
    assert.match(prompt, /Level\.Travel/);
    assert.match(prompt, /Travelata/);
    assert.match(prompt, /Onlinetours/);
    assert.match(prompt, /Запрещено:[\s\S]*Booking[\s\S]*Expedia/);
    assert.match(prompt, /SaleTur/);
    assert.match(prompt, /российских туроператоров/);
  });

  it("includes brief fields, L-levels, playbook, and real newlines in raw brief", () => {
    const prompt = buildTourSearchPrompt(sample);
    assert.match(prompt, /jobId: job-1/);
    assert.match(prompt, /Нижний Новгород/);
    assert.match(prompt, /Турция, Марокко/);
    assert.match(prompt, /autoLevel/);
    assert.match(prompt, /L3:/);
    assert.match(prompt, /lookup_verified_offers/);
    assert.match(prompt, /submit_offer_candidate/);
    assert.match(prompt, /422/);
    assert.match(prompt, /Доп\. пожелания клиента:\nТихий отель у моря/);
    assert.doesNotMatch(prompt, /raw brief:\\n/);
  });

  it("marks children absent when ages empty", () => {
    const prompt = buildTourSearchPrompt({ ...sample, childrenAges: "" });
    assert.match(prompt, /только взрослые/);
  });
});

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
