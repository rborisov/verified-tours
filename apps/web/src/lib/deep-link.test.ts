import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deepLinkRejectionReason, isPackageDeepLink } from "./deep-link";

describe("deepLinkRejectionReason", () => {
  it("rejects saletur country search list", () => {
    const url =
      "https://saletur.ru/%D0%A2%D1%83%D1%80%D1%86%D0%B8%D1%8F/#&query=%7B%22auto%22%3Afalse%2C%22co%22%3A%2283%22%7D";
    const reason = deepLinkRejectionReason(url);
    assert.ok(reason);
    assert.match(reason!, /saletur/i);
    assert.equal(isPackageDeepLink(url), false);
  });

  it("rejects saletur hotel brochure", () => {
    const url =
      "https://saletur.ru/%D0%A2%D1%83%D1%80%D1%86%D0%B8%D1%8F/%D0%90%D0%BD%D1%82%D0%B0%D0%BB%D1%8C%D1%8F/hotel/Mitos_Apart.htm";
    const reason = deepLinkRejectionReason(url);
    assert.ok(reason);
    assert.match(reason!, /brochure|bookable/i);
  });

  it("rejects generic query blob without hotel path", () => {
    const url = "https://example-ota.ru/turkey?#&query=%7B%22df%22%3A%2212.08.2026%22%7D";
    assert.ok(deepLinkRejectionReason(url));
  });

  it("rejects /search paths", () => {
    assert.ok(deepLinkRejectionReason("https://level.travel/search?from=GOJ&to=AYT"));
  });

  it("accepts level.travel hotel-style path", () => {
    assert.equal(
      deepLinkRejectionReason("https://level.travel/hotels/turkey/antalya/mitos-apart"),
      null,
    );
  });
});
