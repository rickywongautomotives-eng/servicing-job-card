// Burson EzyParts lookup: rego in, vehicle + service parts out.
//
// Ricky asked EzyParts' manager before this was built and was given the go
// ahead to pull data into the job card app as a long-standing trade
// customer. Worth keeping that in writing somewhere -- managers move on.
//
// This is NOT HTML scraping. Watching the real site do a rego search showed
// it calling its own JSON endpoints underneath, and those are what this uses:
//
//   GET  /vehicle/rego/search?state=..&rego=..   -> vehicle incl. VIN
//   GET  /vehicle/{id}/cat/{cat}/parts           -> parts, with brand
//   POST /prices/parts?p=id,id,..                -> this account's pricing
//
// That matters: a page-scraper breaks every time Burson restyle something,
// whereas these only break if the data service itself changes, which is far
// rarer. It is still undocumented and unsupported, so treat any failure as
// "fall back to typing it in", never as something that should block a job.
//
// Login is a plain Spring Security form post, so no headless browser is
// needed -- just a cookie jar and two requests.

const ORIGIN = "https://ezyparts.burson.com.au";
const BASE = ORIGIN + "/burson/ezyparts/en/AUD";

// Ricky's trade account. Not a secret -- it is printed on his invoices and
// shown in the EzyParts header. The username and password are secrets and
// live in Secret Manager; see EZYPARTS_USERNAME / EZYPARTS_PASSWORD.
const ACCOUNT_NUMBER = "33709";

// Top-level categories worth pulling for a service. Discovered from the
// site's own category list; see listCategories() if these ever need
// revisiting.
const SERVICE_CATEGORIES = [103];

// Which brand to put on the card, per kind of part. EzyParts lists five or
// six brands for everything, which is useful when shopping and noise on a
// job card, so one is chosen and the rest dropped. All of this is Ricky's
// call, not a guess:
//
//   Filters  Ryco, BASE line preferred -- "Ryco Premium" (R2828PST) is a
//            different product to R2828P and he wants the plain one where
//            both exist, hence the anchored /^ryco$/ first.
//            But Ryco only make a Premium in some lines (cabin filters are
//            usually the N99 RCA...M and nothing else), and skipping straight
//            to Wesfil there was wrong -- it put a Wesfil cabin filter on a
//            car Ryco did stock. So any Ryco beats a non-Ryco; Wesfil is the
//            fallback only when Ryco list nothing at all.
//   Oils     Penrite, always.
//   Belts    Dayco by default, but genuinely brand-agnostic: a 6PK1165 Dayco
//            and a 6PK1165 Gates are the same belt, so any brand will do.
//   Plugs    NGK, else whatever else is listed.
//
// If none of the preferred brands carry the part, preferBrand() falls back to
// whatever is listed rather than leaving the row blank -- a number in the
// wrong brand is still a number, and a blank row helps nobody.
const BRAND_RULES = {
  filter: [/^ryco$/i, /^ryco\b/i, /^wesfil$/i],
  oil: [/^penrite$/i],
  belt: [/^dayco$/i],
  plug: [/^ngk$/i],
};

// A cookie jar just big enough for one login. Nothing here needs the
// generality (or the dependency) of a real cookie library.
function makeJar() {
  const jar = new Map();
  return {
    absorb(response) {
      const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
      raw.forEach((line) => {
        const [pair] = line.split(";");
        const idx = pair.indexOf("=");
        if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      });
    },
    header() {
      return Array.from(jar.entries())
        .map(([k, v]) => k + "=" + v)
        .join("; ");
    },
    has(name) {
      return jar.has(name);
    },
  };
}

// Redirects are followed by hand because cookies are set on the intermediate
// hops -- the session cookie arrives on the login redirect itself, and
// fetch's automatic redirect handling would swallow it.
async function request(jar, url, options = {}) {
  const headers = Object.assign(
    {
      "User-Agent": "Mozilla/5.0 (compatible; AMS-JobCard/1.0)",
      Accept: options.json ? "application/json" : "text/html,application/xhtml+xml",
    },
    options.headers || {}
  );
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;

  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(current, {
      method: options.method || "GET",
      headers,
      body: options.body,
      redirect: "manual",
    });
    jar.absorb(res);
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      current = next.startsWith("http") ? next : ORIGIN + next;
      // A redirect is the server's answer to the POST; everything after it
      // is a plain GET of wherever it sent us.
      options.method = "GET";
      options.body = undefined;
      headers.Cookie = jar.header();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects from EzyParts");
}

function extractCsrf(html) {
  const m = html.match(/name="CSRFToken"[^>]*value="([^"]+)"/i);
  return m ? m[1] : null;
}

async function login(username, password) {
  const jar = makeJar();

  const loginPage = await request(jar, BASE + "/login");
  const html = await loginPage.text();
  const csrf = extractCsrf(html);
  if (!csrf) throw new Error("EzyParts login page did not contain a CSRF token");

  // The login form does NOT submit the username as typed. Its own script
  // (acc.login.js) builds the real user id first:
  //
  //   var uid = accNo + "_" + username;  $("input#j_username").val(uid);
  //
  // so the account is "33709_someone", not "someone". Sending the bare
  // username is rejected with no useful message, which is exactly what
  // happened on the first attempt. Tolerates the secret being stored either
  // way round.
  const bare = String(username).trim();
  const uid = bare.startsWith(ACCOUNT_NUMBER + "_") ? bare : ACCOUNT_NUMBER + "_" + bare;

  const form = new URLSearchParams({
    acc_no: ACCOUNT_NUMBER,
    j_username: uid,
    username: bare,
    j_password: password,
    CSRFToken: csrf,
  });

  const res = await request(jar, BASE + "/j_spring_security_check", {
    method: "POST",
    body: form.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const landed = await res.text();
  // A failed login answers 200 with the login form again rather than an error
  // status, so the landing page is the only signal. Spring Security sends it
  // back to /login (usually with ?error=), which is a sharper test than
  // looking for the word "password" -- the site's own header carries a
  // "Forgot Password?" link on some pages.
  const backAtLogin = /\/login(\?|$)/i.test(res.url || "") || /name="j_password"/i.test(landed);
  if (backAtLogin) {
    throw new Error(
      "EzyParts rejected the sign-in. The stored username should be just the login name " +
        "(the account number is added automatically), and the password must match it."
    );
  }
  return jar;
}

async function getJson(jar, path) {
  const res = await request(jar, BASE + path, { json: true, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("EzyParts " + path + " returned " + res.status);
  return res.json();
}

// Pulls the engine code out of EzyParts' engine string, which reads like
//   "2.0L  PET B48B20B I4 16v DOHC VVT I/C Turbo Direct Inj {190kW}"
// i.e. displacement, fuel, then the code. Taking the second word lands on
// "PET", which is what shipped first time round.
//
// The positional read is tried first, then a search for the token that looks
// like a manufacturer code -- letters and digits together, four or more
// characters, and not the displacement ("2.0L") or valve count ("16v").
function engineCode(engine) {
  const s = String(engine || "").trim();
  if (!s) return "";

  // Everything in these strings that is NOT an engine code. Written as a
  // denylist because requiring a digit was wrong: VW/Audi codes are pure
  // letters (CXDA, CJSA, DKTA), and demanding a digit skipped straight past
  // them and picked up "{162kW}" instead.
  const isNoise = (t) =>
    /^[\d.]+L$/i.test(t) || // displacement, "2.0L"
    /^\d+v$/i.test(t) || // valve count, "16v"
    /^\d+kw$/i.test(t) || // power
    /[{}]/.test(t) || // "{190kW}"
    /^[IVWHFBRL]\d{1,2}$/i.test(t) || // cylinder layout, "I4" "V8" "W12"
    /^(pet|petrol|dsl|diesel|lpg|cng|hyb|hybrid|elec|electric)$/i.test(t) ||
    /^(dohc|sohc|ohv|ohc|vvt|vct|vtec|mpfi|efi|tbi|gdi)$/i.test(t) ||
    /^(turbo|s\/c|i\/c|t\/c|direct|inj|injection|chain|belt|gear)$/i.test(t) ||
    /^(auto|man|awd|rwd|fwd|4wd|2wd)$/i.test(t) ||
    /^(gen|mk|series|type|ser)$/i.test(t); // Holden's "GEN IV LS2"

  const looksLikeCode = (t) => t.length >= 3 && /[A-Za-z]/.test(t) && !isNoise(t);

  // The word after displacement and fuel is the code on most vehicles, but
  // not all -- Holden's "5.7L PET GEN IV LS2 V8" puts "GEN" in that slot --
  // so the positional guess is only taken when it survives the noise check.
  const positional = s.match(/^[\d.]+\s*L\s+\S+\s+(\S+)/i);
  if (positional && looksLikeCode(positional[1])) return positional[1];

  return s.split(/\s+/).find(looksLikeCode) || s;
}

// Transmission and drive, read out of EzyParts' descriptive strings — the
// "Vehicle Details" panel on their own site shows "Transmission: Auto" and
// "Drive: RWD", and those words live in lngDsc ("BMW 330i TOURING Auto G21
// ... 4 Door Wagon RWD PETROL ...") and details ("..., RWD ..., AT"). There
// is no dedicated field for either in the search response.
function transmissionOf(v) {
  const s = (v.lngDsc || "") + " " + (v.details || "");
  const word = s.match(/\b(Automatic|Auto|Manual|CVT|DCT|DSG|AMT)\b/i);
  if (word) {
    const t = word[1].toUpperCase();
    if (t === "AUTO" || t === "AUTOMATIC") return "Auto";
    if (t === "MANUAL") return "Manual";
    return t;
  }
  // details falls back to bare codes: ", AT" / ", MT".
  const code = s.match(/[,\s](AT|MT)\b/);
  if (code) return code[1] === "AT" ? "Auto" : "Manual";
  return "";
}

function driveOf(v) {
  const s = (v.lngDsc || "") + " " + (v.details || "");
  const m = s.match(/\b(4WD|AWD|FWD|RWD|4X4)\b/i);
  return m ? m[1].toUpperCase() : "";
}

// "2022-09" -> "09/22", Ricky's preferred compliance form.
function complianceDisplay(complianceDate) {
  const m = String(complianceDate || "").match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return String(complianceDate || "");
  return m[2].padStart(2, "0") + "/" + m[1].slice(2);
}

// Maps EzyParts' category names onto the job card's own checklist rows.
// Matched on NAME rather than category id: the names are stable and readable
// ("Oil Filter", "Spark Plug"), the numeric ids are not documented anywhere.
//
// `field` is the job card key. `kind` selects the brand preference above.
// Engine Flush is deliberately absent -- Ricky fills that in himself.
const FIELD_RULES = [
  { field: "oilFilter", kind: "filter", match: /^oil filter$/i },
  { field: "oilGrade", kind: "oil", match: /^engine oil$/i },
  { field: "airFilter", kind: "filter", match: /^air filter$/i },
  { field: "cabinFilter", kind: "filter", match: /cabin/i },
  { field: "fuelFilter", kind: "filter", match: /^fuel filter$/i },
  // minDot4: the workshop stocks DOT 4 as its minimum, so DOT 3 products are
  // never suggested even where EzyParts lists them (Ricky: "dot 3 is a very
  // old brake fluid"). Clutch hydraulics use brake fluid, so both rows carry
  // the rule.
  { field: "brakeFluid", kind: "oil", match: /brake fluid/i, minDot4: true },
  // Anchored, or "Throttle Body Coolant Hose" (a hose, in the Cooling
  // category) lands in the Coolant row on any car whose earlier categories
  // don't carry the fluid.
  { field: "coolant", kind: "oil", match: /^(?:engine\s+)?coolant\b|antifreeze/i },
  // The real heading is "Clutch Hydraulic Fluid" -- adjacency never matched
  // it and the row stayed blank on a card whose payload carried it.
  { field: "clutchFluid", kind: "oil", match: /clutch\s*(?:hydraulic\s*)?fluid/i, minDot4: true },
  { field: "sparkPlugs", kind: "plug", match: /spark plug/i },
  // The Belts category is mostly hardware -- "Drive Belt Tensioner
  // Assembly", "Drive Belt Idler Pulley", "Timing Chain Kit" -- and any of
  // those would claim the row on a car with no serpentine-belt heading.
  // "^belt\s*-" covers the per-accessory naming some vehicles use ("Belt -
  // Alternator", "Belt - A/C") without touching "Timing Belt", which is a
  // major job and must never be suggested as a drive belt.
  // join: a car can run several accessory belts ("Belt - Alternator",
  // "Belt - A/C"); Ricky wants every code in the row, not just the first.
  {
    field: "driveBelts",
    kind: "belt",
    join: true,
    match: /^(?!.*(?:tensioner|idler|layout|kit|tool))(?:(?=.*(?:drive belt|serpentine|multi.?rib|v.?belt))|belt\s*-)/i,
  },
  // The card's "Trans Case Oil" is EzyParts' "Transfer Case Oil".
  { field: "transCaseOil", kind: "oil", match: /transfer\s*case/i },
  // The real heading is "Automatic Trans Fluid" -- "Trans", not
  // "Transmission" -- which the first pattern here missed entirely and left
  // the Auto Oil row blank on a card whose payload carried it. The
  // exclusions matter as much as the match: "Automatic Trans Filter" sits
  // right beside it and would otherwise claim the row first, and the Cooling
  // category carries an "Automatic Trans Oil Cooler".
  //
  // DSG/DCT cars (e.g. DMC472) don't have an "Automatic Trans Fluid" heading
  // at all -- EzyParts files their gearbox fluid under "DCT Transmission
  // Fluid" instead, so it was being missed. The second branch catches DCT /
  // DSG / dual-clutch fluid and drops it into this same Auto Oil row (it IS
  // the automatic gearbox's fluid). It insists on "fluid"/"oil" so the DCT
  // hardware and seals sitting in the same category -- "Man/DCT/AMT Trans
  // Front Seal" and friends -- are left alone.
  {
    field: "autoOil",
    kind: "oil",
    match: /^(?!.*(?:filter|cooler|seal|kit|tool))(?:auto(?:matic)?\.?\s*trans|(?:dct|dsg|dual\s*clutch)\s*trans\w*\s*(?:fluid|oil))/i,
  },
  { field: "manualOil", kind: "oil", match: /manual\s*trans|gearbox oil/i },
  // Verified against a real Pajero: requiring only "diff" plus a side put a
  // SuperPro suspension bush in the R/Diff Oil row -- the Shafts category is
  // full of "Differential Mount - Front" and "Differential Mount Bush -
  // Rear" hardware -- so the rules demand "oil" and exclude the hardware
  // words. The oil heading itself was just "Differential Oil", no side at
  // all, which is why each rule accepts an UN-sided heading and only rejects
  // the opposite side: one "Differential Oil" heading fills both rows.
  {
    field: "fDiffOil",
    kind: "oil",
    match: /^(?!.*(?:mount|bush|seal|bearing|gasket|kit|breather))(?=.*diff)(?=.*oil)(?!.*rear)/i,
  },
  {
    field: "rDiffOil",
    kind: "oil",
    match: /^(?!.*(?:mount|bush|seal|bearing|gasket|kit|breather))(?=.*diff)(?=.*oil)(?!.*front)/i,
  },
];

// One-line spec for an oil pick, per Ricky's format: "TG7580 75W-80 GL4 -
// 1.9L" instead of the full "1.9L Capacity ; Full Synthetic, SAE 75W-80,
// API GL-4 PLUS" sentence, which was too long for the checklist rows.
// Pieces, all optional: viscosity (skipped when its digits are already in
// the product code, e.g. EPLUS5W30), GL class for gear oils, DOT rating for
// brake fluid, capacity last.
function shortOilSpec(code, notes) {
  const s = String(notes || "");
  const pieces = [String(code || "").trim()];

  const visc = s.match(/SAE\s*([0-9]{1,2}W-?[0-9]{2,3})/i);
  if (visc) {
    const flat = visc[1].replace(/[^0-9W]/gi, "").toUpperCase();
    const codeFlat = String(code || "").replace(/[^0-9W]/gi, "").toUpperCase();
    if (!codeFlat.includes(flat)) pieces.push(visc[1].toUpperCase());
  }

  const gl = s.match(/API\s*GL-?\s*(\d)/i);
  if (gl) pieces.push("GL" + gl[1]);

  // Skipped when the product name already carries the rating -- Penrite's
  // brake fluid family rows are literally NAMED "DOT 4", and appending the
  // rating again printed "DOT 4 DOT4" on the card.
  const dot = s.match(/DOT\s*([345](?:\.1)?)/i);
  if (dot && !/DOT\s*\d/i.test(String(code || ""))) pieces.push("DOT" + dot[1]);

  const cap = s.match(/([\d.]+)\s*(m?L)\s*Capacity/i);
  const capacity = cap ? cap[1] + cap[2] : "";

  const head = pieces.filter(Boolean).join(" ");
  return capacity ? head + " - " + capacity : head;
}

// DOT rating of a brake/clutch fluid product, read from wherever it appears
// (product name, notes or description). null when nothing states one.
function dotRating(p) {
  const m = ((p.code || "") + " " + (p.notes || "") + " " + (p.description || "")).match(/DOT\s*(\d(?:\.\d)?)/i);
  return m ? parseFloat(m[1]) : null;
}

// Applies the workshop's DOT-4-minimum rule to a brake/clutch fluid listing.
// DOT 4 and DOT 5.1 are glycol fluids and fine; plain DOT 5 is silicone and
// must never go into a glycol system, so it is excluded outright rather than
// treated as "5 >= 4". Products that state no rating are kept only when
// nothing rated 4+ exists. Returns [] for a DOT-3-only listing -- the row is
// better blank than suggesting a fluid the workshop does not stock.
function dot4Minimum(parts) {
  const rated = parts.filter((p) => {
    const r = dotRating(p);
    return r !== null && r >= 4 && r !== 5;
  });
  if (rated.length) return rated;
  return parts.filter((p) => dotRating(p) === null);
}

// Picks one part for a category, following the brand preference and falling
// back to whatever is listed rather than leaving the row empty.
function preferBrand(parts, kind) {
  const rules = BRAND_RULES[kind] || [];
  for (const re of rules) {
    const hit = parts.find((p) => re.test((p.brand || "").trim()));
    if (hit) return hit;
  }
  return parts[0] || null;
}

// Flattens every category in the response into { field: chosenPart }.
function pickParts(partsPayload) {
  const chosen = {};
  const all = [];

  (partsPayload.categories || []).forEach((cat) => {
    const name = (cat.name || "").trim();
    const parts = (cat.parts || []).map((p) => ({
      category: name,
      code: p.name || "",
      brand: (p.brand || "").trim(),
      description: p.desc || "",
      notes: p.notes || "",
      productId: String(p.code || ""),
    }));
    if (!parts.length) return;
    all.push.apply(all, parts);

    // EVERY matching rule fires, not just the first: the Pajero lists one
    // un-sided "Differential Oil" heading that must fill both diff rows.
    // First heading to claim a field still wins -- EzyParts sometimes lists
    // the same part under a second heading.
    FIELD_RULES.forEach((rule) => {
      if (!rule.match.test(name)) return;
      const prev = chosen[rule.field];
      if (prev && !rule.join) return;
      const candidates = rule.minDot4 ? dot4Minimum(parts) : parts;
      if (!candidates.length) return;
      const pick = preferBrand(candidates, rule.kind);
      if (!pick) return;
      // join rows accumulate: a second heading's code is appended to the
      // display ("6PK2260 / 4PK1120") rather than discarded. The rest of the
      // part data stays from the first pick; the same code appearing under
      // two headings is not repeated.
      if (prev) {
        if (pick.code && prev.display.indexOf(pick.code) === -1) {
          chosen[rule.field] = Object.assign({}, prev, { display: prev.display + " / " + pick.code });
        }
        return;
      }
      // Brake/clutch rows show the RATING, not the product name: Penrite's
      // family row is literally named "BF", and "BF DOT4" on the card just
      // begged the question of what BF meant. The rating is the spec here.
      const rating = rule.minDot4 ? dotRating(pick) : null;
      const cap = String(pick.notes || pick.description || "").match(/([\d.]+)\s*(m?L)\s*Capacity/i);
      const display = rating
        ? "DOT" + rating + (cap ? " - " + cap[1] + cap[2] : "")
        : rule.kind === "oil"
          ? shortOilSpec(pick.code, pick.notes || pick.description)
          : pick.code;
      chosen[rule.field] = Object.assign({}, pick, { kind: rule.kind, display });
    });
  });

  return { fields: chosen, all };
}

async function addPrices(jar, parts) {
  const ids = parts.map((p) => p.productId).filter(Boolean);
  if (!ids.length) return parts;
  const res = await request(jar, BASE + "/prices/parts?p=" + ids.join(","), {
    method: "POST",
    json: true,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return parts; // pricing is a bonus; never fail the lookup for it
  let priced;
  try {
    priced = await res.json();
  } catch (err) {
    return parts;
  }
  const byId = new Map();
  const rows = Array.isArray(priced) ? priced : priced.prices || priced.parts || [];
  rows.forEach((row) => {
    const id = String(row.code || row.productCode || row.id || "");
    if (id) byId.set(id, row);
  });
  return parts.map((p) => {
    // Oil FAMILY rows (HPR0, TG7580) have no product id -- the ids live on
    // their per-size children -- so they can never be priced here. They must
    // also never be looked up by an empty key: every no-id part mapping to
    // the same "" entry is exactly how one gearbox oil ended up pasted into
    // oil grade, brake fluid AND coolant at once.
    if (!p.productId) return p;
    const row = byId.get(p.productId);
    if (!row) return p;
    return Object.assign({}, p, {
      price: row.price || row.netPrice || row.value || null,
      rrp: row.rrp || row.listPrice || null,
    });
  });
}

// Category names worth fetching for a service, matched against whatever the
// site's own category list calls them. Discovered rather than hardcoded
// because the numeric ids are undocumented and would be silently wrong if
// Burson ever renumbered them.
// Matched against the workbench sidebar's own headings: Filters & Oil,
// Brakes, Belts & Timing Parts, Cooling, Ignition Start & Charge, Clutch &
// Transmission, Shafts Axles & Wheels (diff oils), Rapid Service.
const SERVICE_CATEGORY_NAMES = /filter|oil|belt|ignition|start|cool|brake|clutch|transmission|driveline|service|axle|shaft|diff/i;

function collectCategories(node, out) {
  if (!node || out.length > 40) return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectCategories(n, out));
    return;
  }
  const id = node.id || node.code || node.categoryId;
  const name = node.name || node.title || node.label;
  if (id != null && name) out.push({ id: String(id), name: String(name) });
  ["children", "subCategories", "categories", "subCats"].forEach((k) => {
    if (node[k]) collectCategories(node[k], out);
  });
}

// Set by serviceCategoryIds so the caller can log what the category endpoint
// actually returned. Discovery failing silently is how the lookup ended up
// only ever fetching filters and oil.
let lastCategoryProbe = null;

// /parts/categories answers with an HTML fragment, not JSON. The real markup
// (captured via the categoryProbe log, 2026-08-12) is a Bootstrap accordion
// with no hrefs at all:
//
//   <div class="card-header" id='level-1-103'>
//     <button ... data-target='.collapse103' ...>
//       <span>Rapid Service</span>
//
// so the id lives in level-1-<id> and the name in the first <span> after it.
// level-1 anchors to TOP-level categories only -- sub-categories are deeper
// levels and the /cat/{id}/parts endpoint rejects their ids. The first
// version of this parser looked for cat/<id> links, matched nothing, and the
// lookup quietly stayed on Rapid Service alone.
//
// Note the mixed quoting is the site's own (id='...' but class="..."), hence
// ['"] on every attribute.
function categoriesFromHtml(html) {
  const found = [];
  const seen = new Set();
  let m;

  const accordion = /id=['"]level-1-(\d{1,4})['"][\s\S]{0,400}?<span[^>]*>\s*([^<]{1,80}?)\s*<\/span>/gi;
  while ((m = accordion.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    found.push({ id, name: m[2].replace(/\s+/g, " ").trim() });
  }

  // Older shapes kept as fallbacks in case the fragment is ever reworked:
  // cat/<id> hrefs, data-category attributes, <option value="...">.
  const link = /(?:cat\/(\d{1,4})\b|data-category(?:id|code)=['"](\d{1,4})['"])[^>]*>([^<]{0,80})</gi;
  while ((m = link.exec(html))) {
    const id = m[1] || m[2];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    found.push({ id, name: (m[3] || "").replace(/\s+/g, " ").trim() });
  }
  const attr = /value=['"](\d{1,4})['"][^>]*>([^<]{1,80})</gi;
  while ((m = attr.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    found.push({ id, name: (m[2] || "").replace(/\s+/g, " ").trim() });
  }

  return found;
}

async function serviceCategoryIds(jar) {
  const res = await request(jar, BASE + "/parts/categories", {
    json: true,
    headers: { Accept: "application/json, text/html;q=0.9, */*;q=0.8" },
  });
  if (!res.ok) throw new Error("/parts/categories returned " + res.status);
  const raw = await res.text();

  let found = [];
  try {
    const payload = JSON.parse(raw);
    collectCategories(payload, found);
  } catch (err) {
    found = categoriesFromHtml(raw);
  }

  lastCategoryProbe = {
    responseStart: raw.slice(0, 400).replace(/\s+/g, " "),
    collected: found.length,
    sample: found.slice(0, 30),
  };

  // Only top-level ids are valid for the /cat/{id}/parts call, and those are
  // the short numeric ones -- sub-categories carry longer ids (10305 under
  // 103) which that endpoint rejects.
  const ids = found
    .filter((c) => SERVICE_CATEGORY_NAMES.test(c.name) && /^\d{1,4}$/.test(c.id))
    .map((c) => c.id);

  const unique = Array.from(new Set(SERVICE_CATEGORIES.map(String).concat(ids)));
  // Ten sequential fetches is a few seconds against a 60s budget, and more
  // than a service needs; anything past that is a sign the name filter has
  // started matching noise.
  return unique.slice(0, 10);
}

// The one thing the rest of the app calls.
async function lookupRego({ rego, state, username, password }) {
  const cleanRego = String(rego || "").trim().toUpperCase();
  if (!cleanRego) throw new Error("No registration supplied");

  const jar = await login(username, password);

  const search = await getJson(
    jar,
    "/vehicle/rego/search?" + new URLSearchParams({ state: state || "VIC", rego: cleanRego })
  );

  const vehicles = search.vehicles || [];
  if (!vehicles.length) {
    return { found: false, rego: cleanRego, message: "No vehicle found for that registration" };
  }

  // More than one match means EzyParts could not narrow it down (different
  // engines under one plate record). Hand them all back and let a person
  // choose rather than guessing on their behalf.
  const v = vehicles[0];

  // Which categories to pull. 103 ("Filters & Oil") is known-good and covers
  // most of a service; the rest are discovered by name so spark plugs, belts,
  // brake fluid and the driveline oils come through too. Discovery is
  // best-effort -- if the category list ever changes shape, the filters still
  // arrive and the card is still better off than it was.
  let categoryIds = SERVICE_CATEGORIES.slice();
  let categoryProbeError = null;
  try {
    categoryIds = await serviceCategoryIds(jar);
  } catch (err) {
    categoryProbeError = (err && err.message) || String(err);
  }

  let fields = {};
  let parts = [];
  // Kept so a caller can log which categories answered and what headings they
  // carried. Without it, "row X did not fill" is unanswerable -- the category
  // could be missing, named differently, or simply not stocked for that car.
  const diagnostics = {
    categoriesTried: categoryIds.slice(),
    categoryNames: [],
    failed: [],
    categoryProbe: lastCategoryProbe,
    categoryProbeError,
  };

  for (const catId of categoryIds) {
    try {
      const payload = await getJson(jar, "/vehicle/" + v.id + "/cat/" + catId + "/parts");
      const picked = pickParts(payload);
      parts = parts.concat(picked.all);
      (payload.categories || []).forEach((c) => {
        if (c.name && (c.parts || []).length) diagnostics.categoryNames.push(c.name);
      });
      // Earlier categories win, so the order of SERVICE_CATEGORIES matters:
      // filters and oil first, since that is where the service items live.
      fields = Object.assign({}, picked.fields, fields);
    } catch (err) {
      diagnostics.failed.push(String(catId));
    }
  }

  try {
    const pricedList = await addPrices(jar, Object.values(fields));
    // Same empty-key hazard as inside addPrices: parts without a product id
    // must not share a Map slot, or every id-less field gets whichever part
    // landed there last.
    const byId = new Map();
    pricedList.forEach((p) => {
      if (p.productId) byId.set(p.productId, p);
    });
    Object.keys(fields).forEach((k) => {
      if (!fields[k].productId) return;
      const priced = byId.get(fields[k].productId);
      if (priced) fields[k] = priced;
    });
  } catch (err) {
    // pricing is a bonus, never a reason to fail
  }

  return {
    found: true,
    rego: cleanRego,
    state: state || "VIC",
    vehicle: {
      vin: search.vin || v.vin || "",
      year: search.year || "",
      complianceDate: search.complianceDate || "",
      make: v.make || "",
      model: v.model || "",
      series: v.series || "",
      engine: v.engine || "",
      engineCode: engineCode(v.engine),
      // The REAL engine number (stamped on the block), from NEVDIS via the
      // search response. Often empty — the BMW test car has none — but when
      // present it beats the code: "a sure way method of making sure its the
      // correct engine number without ever 2nd guessing" (Ricky). The client
      // uses it first and falls back to the code.
      engineNo: (search.engineNo || "").trim(),
      transmission: transmissionOf(v),
      drive: driveOf(v),
      compliance: complianceDisplay(search.complianceDate),
      description: v.lngDsc || v.desc || "",
      details: v.details || "",
      ezyPartsVehicleId: String(v.id || ""),
    },
    alternatives: vehicles.length > 1 ? vehicles.map((x) => ({ id: String(x.id), desc: x.lngDsc || x.desc })) : [],
    // Keyed by job card field, ready to drop straight into the checklist.
    fields,
    // Everything found, for anything that wants to offer alternatives later.
    parts,
    diagnostics,
  };
}

module.exports = {
  lookupRego,
  pickParts,
  preferBrand,
  extractCsrf,
  engineCode,
  categoriesFromHtml,
  shortOilSpec,
  dot4Minimum,
  transmissionOf,
  driveOf,
  complianceDisplay,
  FIELD_RULES,
};
