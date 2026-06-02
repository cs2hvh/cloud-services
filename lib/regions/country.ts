// Region / location → ISO 3166-1 alpha-2 country code, for flag rendering.
//
// Matches on country names, major city names, airport codes, and common region
// slugs — so it resolves whether a region is identified by slug ("fra"),
// display name ("Frankfurt"), or country ("Germany"). Used by <RegionFlag/>.

const COUNTRY_CODES: Record<string, string> = {
  // India
  india: "in", in: "in", ind: "in", bom: "in", blr: "in", del: "in", maa: "in", hyd: "in",
  mumbai: "in", bangalore: "in", bengaluru: "in", delhi: "in", "new-delhi": "in",
  chennai: "in", hyderabad: "in", pune: "in", noida: "in", kolkata: "in",
  // Germany
  germany: "de", de: "de", ger: "de", deu: "de", fra: "de", muc: "de", ber: "de",
  frankfurt: "de", munich: "de", berlin: "de", nuremberg: "de", hamburg: "de", limburg: "de",
  // France
  france: "fr", fr: "fr", par: "fr", cdg: "fr", paris: "fr",
  marseille: "fr", gravelines: "fr", roubaix: "fr", strasbourg: "fr", lille: "fr",
  // United Kingdom
  uk: "gb", gb: "gb", gbr: "gb", "united-kingdom": "gb", britain: "gb", england: "gb",
  lon: "gb", lhr: "gb", london: "gb", manchester: "gb",
  // United States
  us: "us", usa: "us", "united-states": "us", america: "us",
  "us-east": "us", "us-west": "us", "us-central": "us", "us-south": "us",
  nyc: "us", lax: "us", sfo: "us", iad: "us", ord: "us", dfw: "us", sea: "us", atl: "us",
  "new-york": "us", "los-angeles": "us", "san-francisco": "us", virginia: "us",
  oregon: "us", dallas: "us", chicago: "us", ashburn: "us", seattle: "us", miami: "us",
  // Singapore
  singapore: "sg", sg: "sg", sgp: "sg", sin: "sg",
  // Netherlands
  netherlands: "nl", nl: "nl", nld: "nl", ams: "nl", amsterdam: "nl", holland: "nl",
  // Australia
  australia: "au", au: "au", aus: "au", syd: "au", sydney: "au", melbourne: "au", mel: "au",
  // Canada
  canada: "ca", ca: "ca", can: "ca", tor: "ca", yyz: "ca", yul: "ca",
  toronto: "ca", montreal: "ca", beauharnois: "ca", vancouver: "ca",
  // Japan
  japan: "jp", jp: "jp", jpn: "jp", tok: "jp", tyo: "jp", nrt: "jp", hnd: "jp",
  tokyo: "jp", osaka: "jp",
  // Brazil
  brazil: "br", br: "br", bra: "br", sao: "br", gru: "br", "sao-paulo": "br", saopaulo: "br",
  // UAE
  uae: "ae", ae: "ae", are: "ae", dxb: "ae", dubai: "ae", "abu-dhabi": "ae",
  // Poland
  poland: "pl", pl: "pl", pol: "pl", waw: "pl", warsaw: "pl",
  // Sweden
  sweden: "se", se: "se", swe: "se", arn: "se", stockholm: "se",
  // Ireland
  ireland: "ie", ie: "ie", irl: "ie", dub: "ie", dublin: "ie",
  // Italy
  italy: "it", it: "it", ita: "it", mil: "it", mxp: "it", milan: "it", rome: "it",
  // Spain
  spain: "es", es: "es", esp: "es", mad: "es", madrid: "es", barcelona: "es",
  // Finland / Norway / Switzerland / Belgium
  finland: "fi", fi: "fi", hel: "fi", helsinki: "fi",
  norway: "no", no: "no", osl: "no", oslo: "no",
  switzerland: "ch", ch: "ch", zrh: "ch", zurich: "ch",
  belgium: "be", be: "be", bru: "be", brussels: "be",
  // Korea / Hong Kong
  southkorea: "kr", "south-korea": "kr", korea: "kr", kr: "kr", seoul: "kr", icn: "kr",
  "hong-kong": "hk", hongkong: "hk", hk: "hk", hkg: "hk",
};

/**
 * Resolve a country code from any of the given candidates (slug, display name,
 * country…). Tries the whole string, then each token (reversed, so the most
 * specific trailing token wins, e.g. "asia-sg" → "sg"). Returns null if unknown.
 */
export function countryCodeFor(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const s = c.toLowerCase().trim();
    if (COUNTRY_CODES[s]) return COUNTRY_CODES[s];
    const tokens = s.split(/[-_/,\s]+/).filter(Boolean);
    for (const t of [...tokens].reverse()) {
      if (COUNTRY_CODES[t]) return COUNTRY_CODES[t];
    }
  }
  return null;
}

/** flagcdn URL at a fixed pixel size (4:3). e.g. flagUrl("sg", 32, 24). */
export function flagUrl(code: string, width = 32, height = 24): string {
  // flagcdn requires lowercase ISO codes (NL → 404, nl → 200). Callers may pass
  // an uppercase code straight from the DB, so normalize here.
  return `https://flagcdn.com/${width}x${height}/${code.toLowerCase()}.png`;
}

// flagcdn ONLY serves these discrete 4:3 sizes — any other WxH 404s. Snap to the
// smallest valid width >= 2x the display width (so it's crisp on retina).
const FLAG_WIDTHS = [16, 20, 24, 28, 32, 36, 40, 48, 56, 64, 80, 96, 112, 128, 160, 256];
export function flagPx(displayWidth: number): { w: number; h: number } {
  const target = Math.max(16, Math.round(displayWidth * 2));
  const w = FLAG_WIDTHS.find((x) => x >= target) ?? 256;
  return { w, h: Math.round((w * 3) / 4) };
}
