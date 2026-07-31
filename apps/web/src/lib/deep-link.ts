/**
 * Reject OTA search/list/brochure URLs so admins get a bookable offer page.
 */
export function deepLinkRejectionReason(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Invalid deepLink URL.";
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return "deepLink must be http(s).";
  }

  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const path = decodeURIComponent(u.pathname);
  const pathLower = path.toLowerCase();
  const segments = pathLower.split("/").filter(Boolean);
  const hasQueryBlob =
    /[#?&]query=/i.test(u.href) ||
    u.hash.includes("%7B") ||
    u.search.includes("%7B");

  const looksLikeHotelPage =
    /\/hotel\//i.test(pathLower) ||
    /\/hotels?\//i.test(pathLower) ||
    /\/tour\//i.test(pathLower) ||
    /\/package\//i.test(pathLower) ||
    /\/offer\//i.test(pathLower);

  // SaleTur: country list + SPA query hash, and static hotel brochures are NOT bookable offer pages.
  if (host === "saletur.ru" || host.endsWith(".saletur.ru")) {
    if (/\/hotel\/[^/]+\.htm/i.test(pathLower)) {
      return (
        "saletur.ru /hotel/*.htm is a hotel brochure, not a bookable tour page. " +
        "Use Level.Travel / Travelata / Onlinetours offer/checkout URL instead."
      );
    }
    return (
      "saletur.ru links are usually search lists, not bookable offers. " +
      "Prefer Level.Travel / Travelata / Onlinetours package pages."
    );
  }

  // Any OTA: encoded search-state blob without a hotel/package path.
  if (hasQueryBlob && !looksLikeHotelPage) {
    return (
      "deepLink looks like a search listing (query={…}), not a bookable offer page. " +
      "Navigate to the buy/book page and resubmit that URL."
    );
  }

  // Single path segment (e.g. /Турция/) + search hash/params → listing.
  if (segments.length <= 1 && (u.hash.length > 8 || u.search.length > 8)) {
    return "deepLink looks like a destination search page, not a bookable offer.";
  }

  if (/\/search\b/i.test(pathLower) && !looksLikeHotelPage) {
    return "deepLink is a /search URL. Use the opened bookable offer page URL instead.";
  }

  return null;
}

export function isPackageDeepLink(url: string): boolean {
  return deepLinkRejectionReason(url) === null;
}
