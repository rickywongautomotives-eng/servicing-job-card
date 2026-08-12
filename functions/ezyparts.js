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

// "Filters & Oil" -- the category the site itself requests for a service.
const SERVICE_PARTS_CATEGORY = 103;

// Only these two brands reach the job card. EzyParts lists five or six
// brands per part, which is useful when you are shopping and noise when you
// are filling in a job card. Ricky's call: stick to what the workshop fits.
const KEEP_BRANDS = [/^ryco/i, /^penrite/i];

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

// Flattens the parts response down to the handful of lines a job card wants,
// keeping only the brands the workshop actually fits.
function pickParts(partsPayload) {
  const out = [];
  (partsPayload.categories || []).forEach((cat) => {
    (cat.parts || []).forEach((p) => {
      if (!KEEP_BRANDS.some((re) => re.test(p.brand || ""))) return;
      out.push({
        category: cat.name || "",
        code: p.name || "",
        brand: p.brand || "",
        description: p.desc || "",
        notes: p.notes || "",
        productId: String(p.code || ""),
      });
    });
  });
  return out;
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

  let parts = [];
  try {
    const payload = await getJson(jar, "/vehicle/" + v.id + "/cat/" + SERVICE_PARTS_CATEGORY + "/parts");
    parts = await addPrices(jar, pickParts(payload));
  } catch (err) {
    // A vehicle with no VIN is still worth returning.
    parts = [];
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
    parts,
  };
}

module.exports = { lookupRego, pickParts, extractCsrf, engineCode };
