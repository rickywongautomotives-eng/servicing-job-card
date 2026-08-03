// Scheduled Cloud Function: reads the "AMS Bookings" Google Calendar once a
// day and auto-creates a "prefilled" job card in Firestore for each booking
// happening tomorrow, so a tech opens the app to find tomorrow's jobs
// already sitting there instead of typing everything from scratch.
//
// Field-mapping rules here were worked out directly against real booking
// examples with the workshop owner -- see the "prefilled" section of
// job_card_project.md memory for the full reasoning. Do not change the
// parsing rules without re-confirming against a real booking.

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");

admin.initializeApp();
const db = admin.firestore();

const TIMEZONE = "Australia/Sydney";
// "AMS Bookings" calendar ID, from Settings and sharing -> Integrate
// calendar. Queried directly rather than via calendarList.list(), because
// sharing a calendar with a service account grants it read access to that
// calendar ID but never makes the calendar appear in the service account's
// own calendarList -- that only happens when a real person accepts an
// email invite, which a service account can't do. Confirmed via testing:
// calendarList.list() returned zero calendars even with sharing correctly
// set up, while querying this ID directly works.
const CALENDAR_ID = "2bb5294927d0e8741203f0086f97ebf6112b2192a9392415da25ab98d5970ab1@group.calendar.google.com";

// Mirrors src/config.js exactly -- keep in sync if the app's field lists change.
const HEADER_KEYS = ["date", "customer", "email", "mobile", "technician", "make", "model", "registration", "kilometers", "vin", "engineNumber"];
const CARD_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const FLUID_ITEMS = [
  { key: "engineFlush", patterns: ["engine flush"] },
  { key: "airFilter", patterns: ["air filter"] },
  { key: "cabinFilter", patterns: ["cabin filter"] },
  { key: "fuelFilter", patterns: ["fuel filter"] },
  { key: "brakeFluid", patterns: ["brake flush", "brake fluid"] },
  { key: "coolant", patterns: ["coolant"] },
  { key: "clutchFluid", patterns: ["clutch fluid"] },
  { key: "sparkPlugs", patterns: ["spark plug"] },
  { key: "transCaseOil", patterns: ["transfer case oil", "trans case oil"] },
  { key: "autoOil", patterns: ["auto oil", "automatic oil"] },
  { key: "manualOil", patterns: ["manual oil"] },
  { key: "fDiffOil", patterns: ["front diff oil", "f/diff oil", "f diff oil"] },
  { key: "rDiffOil", patterns: ["rear diff oil", "r/diff oil", "r diff oil"] },
  { key: "driveBelts", patterns: ["drive belt"] },
];

function generateJobId() {
  return Date.now() + "-" + Math.random().toString(36).slice(2);
}

function generateCardCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CARD_CODE_CHARS[Math.floor(Math.random() * CARD_CODE_CHARS.length)];
  }
  return code;
}

function buildJobLabel(header) {
  const parts = [header.customer, [header.make, header.model].filter(Boolean).join(" ")].filter(Boolean);
  return parts.length ? parts.join(" — ") : header.registration || "Untitled job";
}

// "Dereck Luc/1LZ7YS/Toyota Landcruiser Prado - Service" ->
// { customer, registration, make, model, jobType }
function parseTitle(title) {
  const slashParts = (title || "").split("/");
  if (slashParts.length < 3) return null;
  const customer = slashParts[0].trim();
  const registration = slashParts[1].trim();
  const rest = slashParts.slice(2).join("/"); // in case make/model itself contains a slash
  const dashIndex = rest.lastIndexOf(" - ");
  if (dashIndex === -1) return null;
  const makeModel = rest.slice(0, dashIndex).trim();
  const jobType = rest.slice(dashIndex + 3).trim();
  // Some real bookings prefix the make with a model year (e.g. "2013 Toyota
  // Aurion") -- strip a leading 4-digit year so Make comes out as just the
  // manufacturer, keeping the year attached to Model rather than dropping it.
  const yearMatch = makeModel.match(/^(\d{4})\s+(.+)$/);
  const modelYear = yearMatch ? yearMatch[1] : "";
  const makeModelRest = yearMatch ? yearMatch[2] : makeModel;
  const [make, ...modelParts] = makeModelRest.split(" ");
  const model = (modelParts.join(" ") + (modelYear ? " (" + modelYear + ")" : "")).trim();
  if (!customer || !registration || !make || !model || !jobType) return null;
  return { customer, registration, make, model, jobType };
}

// Returns "service" | "ppi" -- combined ("pre purchase + service") and any
// unrecognized job type both fall back to "service" per the owner's call.
function classifyJobType(jobType) {
  const t = (jobType || "").toLowerCase();
  const hasPrePurchase = t.includes("pre purchase") || t.includes("pre-purchase");
  const hasService = t.includes("service");
  if (hasPrePurchase && !hasService) return "ppi";
  return "service";
}

// Conservative extraction: only pulls a value when it's clearly labeled, so
// a false match never silently lands in the wrong field.
function extractLabeled(fullText, labelPatterns) {
  for (const label of labelPatterns) {
    const re = new RegExp(label + "\\s*[:\\-]\\s*([^\\n\\r]+)", "i");
    const m = fullText.match(re);
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}

function extractEmail(fullText) {
  const m = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : "";
}

function extractMobile(fullText) {
  const m = fullText.match(/\b0[2-478][\s-]?\d{4}[\s-]?\d{4}\b/);
  return m ? m[0].trim() : "";
}

// Parses the description body for a General Service booking: oil grade/
// filter line, fluids & filters checklist matches (combining duplicate
// matches for the same item into one value), and dumps every unmatched
// line into office notes so nothing from the booking is lost.
// Some bookings arrive via a third-party booking widget synced into the
// calendar, whose description text contains literal HTML (<ul><li>...).
// Convert block-level tags to line breaks before stripping the rest, so
// "<li>Air filter A1891</li>" becomes its own clean line instead of one
// starting with a stray "<li>" that no pattern below would ever match.
function htmlToLines(text) {
  return (text || "")
    .replace(/<\s*(li|br|\/li|\/ul|\/ol|\/div|\/p)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .split(/\r?\n/);
}

// Boilerplate the booking system adds to every description. None of it
// belongs on the printed card: Phone/Email/Vehicle already populate the
// header fields, and the booking code, requested drop-off window and sync
// timestamp are administrative noise. The office notes box only fits about
// nine lines, so every line spent on this is a line lost to something the
// technician actually needs.
//
// Note "Service:" WITH a colon is the booking system's own summary
// ("Service: thermostat union + RWC check") and is dropped, whereas
// "Service 0W-30 ENVIRO+ C2 7.5L/Z418" (no colon, a space) is the oil spec
// and is parsed below. The colon is the whole difference -- don't loosen it.
const BOILERPLATE_PATTERNS = [
  /^booking\s*#/i,
  /^manual booking\b/i,
  /^phone\s*:/i,
  /^email\s*:/i,
  /^vehicle\s*:/i,
  /^service\s*:/i,
  /^customer requested\b/i,
  /^last synced\b/i,
];

function isBoilerplate(line) {
  return BOILERPLATE_PATTERNS.some((re) => re.test(line));
}

function parseServiceDescription(description) {
  const fluids = {};
  let oilGrade = "";
  let oilFilter = "";
  const unmatchedLines = [];

  const lines = htmlToLines(description);
  // "History flags" and "Internal notes" mark real content about the
  // vehicle, but explicitly NOT part of the current job ("not yet done, not
  // booked") -- everything from that point on goes to office notes verbatim,
  // never matched against the current fluids/filters checklist, even if a
  // line inside it happens to look like "Air filter A1891".
  let inNotesSection = false;
  let inInternalNotes = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // "Internal notes" is office-side chatter and is dropped in full,
    // heading and contents (the owner's explicit call). It runs until the
    // next recognisable section begins.
    if (/^internal notes\b/i.test(line)) {
      inNotesSection = true; // also stops fluids matching from here on
      inInternalNotes = true;
      continue;
    }
    if (inInternalNotes) {
      if (/^(history flags|workshop software)\b/i.test(line) || isBoilerplate(line)) {
        inInternalNotes = false;
      } else {
        continue;
      }
    }

    if (isBoilerplate(line)) continue;

    // "History flags" IS kept -- it's real information about the vehicle --
    // but it describes work that is explicitly NOT part of this job ("not
    // yet done, not booked"), so from here on nothing is matched against the
    // current fluids/filters checklist. That matters: these sections really
    // do contain lines like "Air filter A1891" and "Brake flush DOT 3",
    // which would otherwise be ticked as if they were today's work.
    if (!inNotesSection && /^history flags\b/i.test(line)) {
      inNotesSection = true;
    }

    if (!inNotesSection) {
      const serviceMatch = line.match(/^service\s+(.+)$/i);
      if (serviceMatch) {
        const value = serviceMatch[1].trim();
        const lastSlash = value.lastIndexOf("/");
        if (lastSlash !== -1) {
          oilGrade = value.slice(0, lastSlash).trim();
          oilFilter = value.slice(lastSlash + 1).trim();
        } else {
          oilGrade = value;
        }
        continue;
      }

      let matched = false;
      for (const item of FLUID_ITEMS) {
        for (const pattern of item.patterns) {
          const re = new RegExp("^" + pattern + "\\s*[:\\-]?\\s*(.*)$", "i");
          const m = line.match(re);
          if (m) {
            const value = m[1].trim();
            if (fluids[item.key]) {
              fluids[item.key] = value ? fluids[item.key] + " / " + value : fluids[item.key];
            } else {
              fluids[item.key] = value;
            }
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) continue;
    }

    unmatchedLines.push(line);
  }

  return { oilGrade, oilFilter, fluids, officeNotes: unmatchedLines.join("<br>") };
}

function tomorrowRange() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce((acc, p) => ((acc[p.type] = p.value), acc), {});
  const todaySydney = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00+10:00`);
  // Note: fixed +10:00 offset (AEST); DST (+11:00, AEDT) is a known
  // simplification -- acceptable since this only shifts the window by an
  // hour, not which calendar day counts as "tomorrow".
  const tomorrowStart = new Date(todaySydney.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);
  return { start: tomorrowStart, end: tomorrowEnd, dateStr: `${parts.year}-${parts.month}-${String(Number(parts.day) + 1).padStart(2, "0")}` };
}

async function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });
  const client = await auth.getClient();
  return google.calendar({ version: "v3", auth: client });
}

async function jobExistsForEvent(eventId) {
  const snap = await db.collection("jobs").where("calendarEventId", "==", eventId).limit(1).get();
  return !snap.empty;
}

function buildServiceJob(parsed, event, dateStr) {
  const desc = parseServiceDescription(event.description || "");
  const fullText = [event.summary, htmlToLines(event.description).join("\n"), event.location].filter(Boolean).join("\n");

  const header = {};
  HEADER_KEYS.forEach((k) => (header[k] = ""));
  header.date = dateStr;
  header.customer = parsed.customer;
  header.registration = parsed.registration;
  header.make = parsed.make;
  header.model = parsed.model;
  header.email = extractEmail(fullText);
  header.mobile = extractMobile(fullText);
  header.vin = extractLabeled(fullText, ["vin", "vin number", "vin no"]);
  header.engineNumber = extractLabeled(fullText, ["engine no", "engine number"]);
  header.technician = extractLabeled(fullText, ["technician"]);
  // kilometers deliberately never auto-populated -- arrival mileage can't be known in advance.

  // Every row key must be present with the client's default shape --
  // FluidRow (App.js) unconditionally reads fluids[row.key].checkedBy for
  // every configured row and crashes (blank screen, confirmed via testing)
  // if a key is missing entirely rather than present-but-unchecked.
  const fluids = {};
  FLUID_ITEMS.forEach((item) => {
    fluids[item.key] = { checked: false, checkedBy: "", value: "", valueBy: "" };
  });
  Object.keys(desc.fluids).forEach((key) => {
    fluids[key] = { checked: true, checkedBy: "", value: desc.fluids[key], valueBy: "" };
  });

  return {
    template: "general-service",
    header,
    oilSpec: { oilGrade: desc.oilGrade, oilFilter: desc.oilFilter },
    fluids,
    officeNotes: desc.officeNotes,
  };
}

function buildPpiJob(parsed, dateStr) {
  const header = {};
  HEADER_KEYS.forEach((k) => (header[k] = ""));
  header.date = dateStr;
  header.customer = parsed.customer;
  header.registration = parsed.registration;
  header.make = parsed.make;
  header.model = parsed.model;
  return { template: "pre-purchase-inspection", header };
}

const SERVICE_ACCOUNT_EMAIL = "firebase-adminsdk-fbsvc@ams-service-job-card.iam.gserviceaccount.com";

exports.prefillJobsFromCalendar = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: TIMEZONE,
    region: "australia-southeast1",
    serviceAccount: SERVICE_ACCOUNT_EMAIL,
  },
  async () => {
    const { start, end, dateStr } = tomorrowRange();
    const calendar = await getCalendarClient();

    const res = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = res.data.items || [];
    logger.info(`Found ${events.length} booking(s) for ${dateStr}`);

    for (const event of events) {
      try {
        if (await jobExistsForEvent(event.id)) {
          logger.info(`Skipping ${event.id} -- already prefilled`);
          continue;
        }
        const parsed = parseTitle(event.summary);
        if (!parsed) {
          logger.warn(`Could not parse title, skipping: "${event.summary}"`);
          continue;
        }

        const kind = classifyJobType(parsed.jobType);
        const partial = kind === "ppi" ? buildPpiJob(parsed, dateStr) : buildServiceJob(parsed, event, dateStr);

        const id = generateJobId();
        await db
          .collection("jobs")
          .doc(id)
          .set({
            template: partial.template,
            status: "prefilled",
            label: buildJobLabel(partial.header),
            savedAt: Date.now(),
            updatedBy: "calendar-sync",
            calendarEventId: event.id,
            state: {
              cardCode: generateCardCode(),
              header: partial.header,
              oilSpec: partial.oilSpec,
              fluids: partial.fluids,
              officeNotes: partial.officeNotes,
            },
          });
        logger.info(`Created prefilled ${partial.template} job for "${parsed.customer}" (${event.id})`);
      } catch (err) {
        logger.error(`Failed to process event ${event.id}`, err);
      }
    }
  }
);
