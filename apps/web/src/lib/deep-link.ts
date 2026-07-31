/**
 * Reject OTA search/list URLs so admins get a hotel package page, not a results list.
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

  // SaleTur: country list + SPA query hash is NOT a hotel page.
  // Good: /Турция/Анталья/hotel/Some_Hotel.htm
  // Bad:  /Турция/#&query={...}
  if (host === "saletur.ru" || host.endsWith(".saletur.ru")) {
    if (!/\/hotel\//i.test(pathLower)) {
      return (
        "saletur.ru deepLink must be a hotel page " +
        "(/Страна/Курорт/hotel/Name.htm), not a country/search list with #query=."
      );
    }
  }

  // Any OTA: encoded search-state blob without a hotel/package path.
  if (hasQueryBlob && !looksLikeHotelPage) {
    return (
      "deepLink looks like a search listing (query={…}), not a specific hotel package page. " +
      "Open the hotel card, copy that page URL, and resubmit."
    );
  }

  // Single path segment (e.g. /Турция/) + search hash/params → listing.
  if (segments.length <= 1 && (u.hash.length > 8 || u.search.length > 8)) {
    return "deepLink looks like a destination search page, not a specific hotel package.";
  }

  if (/\/search\b/i.test(pathLower) && !looksLikeHotelPage) {
    return "deepLink is a /search URL. Use the opened hotel/package page URL instead.";
  }

  return null;
}

export function isPackageDeepLink(url: string): boolean {
  return deepLinkRejectionReason(url) === null;
}
