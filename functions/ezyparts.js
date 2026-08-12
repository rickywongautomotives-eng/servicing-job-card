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
//   Filters  Ryco, and the BASE line only -- "Ryco Premium" (R2828PST) is a
//            different product to R2828P and he only wants the plain one.
//            Hence the anchored /^ryco$/ rather than /^ryco/. Wesfil is the
//            fallback because Ryco do not list every fuel filter.
//   Oils     Penrite, always.
//   Belts    Dayco by default, but genuinely brand-agnostic: a 6PK1165 Dayco
//            and a 6PK1165 Gates are the same belt, so any brand will do.
//   Plugs    NGK, else whatever else is listed.
//
// If none of the preferred brands carry the part, preferBrand() falls back to
// whatever is listed rather than leaving the row blank -- a number in the
// wrong brand is still a number, and a blank row helps nobody.
const BRAND_RULES = {
  filter: [/^ryco$/i, /^wesfil$/i],
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

  const looksLikeCode = (t) =>
    t.length >= 3 &&
    /[A-Za-z]/.test(t) &&
    /\d/.test(t) &&
    !/^[\d.]+L$/i.test(t) && // displacement, "2.0L"
    !/^\d+v$/i.test(t); // valve count, "16v"

  // The word after displacement and fuel is the code on most vehicles, but
  // not all: Holden's "5.7L PET GEN IV LS2 V8" puts "GEN" there, so only
  // accept the positional guess when it actually looks like a code.
  const positional = s.match(/^[\d.]+\s*L\s+\S+\s+(\S+)/i);
  if (positional && looksLikeCode(positional[1])) return positional[1];

  return s.split(/\s+/).find(looksLikeCode) || s;
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
  { field: "brakeFluid", kind: "oil", match: /brake fluid/i },
  { field: "coolant", kind: "oil", match: /coolant|antifreeze/i },
  { field: "clutchFluid", kind: "oil", match: /clutch fluid/i },
  { field: "sparkPlugs", kind: "plug", match: /spark plug/i },
  { field: "driveBelts", kind: "belt", match: /drive belt|serpentine|multi.?rib|v.?belt/i },
  { field: "transCaseOil", kind: "oil", match: /transfer case/i },
  { field: "autoOil", kind: "oil", match: /automatic transmission (fluid|oil)|auto trans/i },
  { field: "manualOil", kind: "oil", match: /manual transmission (fluid|oil)|manual trans|gearbox oil/i },
  { field: "fDiffOil", kind: "oil", match: /front diff/i },
  { field: "rDiffOil", kind: "oil", match: /rear diff/i },
];

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

    const rule = FIELD_RULES.find((r) => r.match.test(name));
    if (!rule) return;
    // First category to claim a field wins; EzyParts sometimes lists the
    // same part under a second heading.
    if (chosen[rule.field]) return;
    const pick = preferBrand(parts, rule.kind);
    if (pick) chosen[rule.field] = pick;
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
const SERVICE_CATEGORY_NAMES = /filter|oil|belt|ignition|start|cool|brake|clutch|transmission|driveline|service/i;

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

async function serviceCategoryIds(jar) {
  const payload = await getJson(jar, "/parts/categories");
  const found = [];
  collectCategories(payload, found);

  // Only top-level ids are valid for the /cat/{id}/parts call, and those are
  // the short numeric ones -- sub-categories carry longer ids (10305 under
  // 103) which that endpoint rejects.
  const ids = found
    .filter((c) => SERVICE_CATEGORY_NAMES.test(c.name) && /^\d{1,4}$/.test(c.id))
    .map((c) => c.id);

  const unique = Array.from(new Set(SERVICE_CATEGORIES.map(String).concat(ids)));
  // A service lookup should stay under a second or two; a dozen categories
  // is already more than a service needs.
  return unique.slice(0, 8);
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
  try {
    categoryIds = await serviceCategoryIds(jar);
  } catch (err) {
    // keep the fallback
  }

  let fields = {};
  let parts = [];
  for (const catId of categoryIds) {
    try {
      const payload = await getJson(jar, "/vehicle/" + v.id + "/cat/" + catId + "/parts");
      const picked = pickParts(payload);
      parts = parts.concat(picked.all);
      // Earlier categories win, so the order of SERVICE_CATEGORIES matters:
      // filters and oil first, since that is where the service items live.
      fields = Object.assign({}, picked.fields, fields);
    } catch (err) {
      // One dud category should not cost the whole lookup.
    }
  }

  try {
    const pricedList = await addPrices(jar, Object.values(fields));
    const byId = new Map(pricedList.map((p) => [p.productId, p]));
    Object.keys(fields).forEach((k) => {
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
      // EzyParts does not hold the engine NUMBER stamped on the block, so
      // the engine code goes in that field instead -- Ricky's call: the code
      // alone already tells a technician most of what they need.
      engine: v.engine || "",
      engineCode: engineCode(v.engine),
      description: v.lngDsc || v.desc || "",
      details: v.details || "",
      ezyPartsVehicleId: String(v.id || ""),
    },
    alternatives: vehicles.length > 1 ? vehicles.map((x) => ({ id: String(x.id), desc: x.lngDsc || x.desc })) : [],
    // Keyed by job card field, ready to drop straight into the checklist.
    fields,
    // Everything found, for anything that wants to offer alternatives later.
    parts,
  };
}

module.exports = { lookupRego, pickParts, preferBrand, extractCsrf, engineCode, FIELD_RULES };
