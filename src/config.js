// Static field/row definitions shared by App.js. Plain globals (no module system, no build step).

// The only account exempt from the "locked after completion" rule and
// allowed to reopen a completed card via the Edit button — matches the sole
// address in firestore.rules/storage.rules' allowlist.
var OWNER_EMAIL = "rickywongautomotives@gmail.com";

var HEADER_FIELDS = [
  { key: "date", label: "Date", type: "date" },
  { key: "customer", label: "Customer", type: "text" },
  { key: "email", label: "Email", type: "email" },
  { key: "mobile", label: "Mobile", type: "tel" },
  { key: "technician", label: "Technician", type: "text" },
  { key: "make", label: "Make", type: "text" },
  { key: "model", label: "Model", type: "text" },
  { key: "registration", label: "Registration", type: "text" },
  { key: "kilometers", label: "Kilometers", type: "number" },
  { key: "vin", label: "VIN Number", type: "text" },
  { key: "engineNumber", label: "Engine No", type: "text" },
];

// Groups the header fields into scannable clusters.
// Job & Customer is a clean one-field-per-line list (Date/Customer/Mobile/
// Email all run long enough to want the full row, or are the first thing
// to fill in). Technician pairs with Engine No under Vehicle instead —
// both short values. VIN fills the row Vehicle would otherwise leave
// blank, since Job & Customer runs one line taller than Vehicle's others.
var HEADER_GROUPS = [
  {
    title: "Job & Customer",
    keys: ["date", "customer", "mobile", "email"],
  },
  {
    title: "Vehicle",
    keys: ["make", "model", "registration", "kilometers", "engineNumber", "technician", "vin"],
  },
];

var WIDE_HEADER_FIELD_KEYS = ["customer", "mobile", "email", "vin", "date"];

// Quick-reference callout for techs (what parts to grab) — set by the office,
// not a checklist item, so it lives outside the Fluids & Filters section.
var OIL_SPEC_FIELDS = [
  { key: "oilGrade", label: "Oil Grade", type: "text" },
  { key: "oilFilter", label: "Oil Filter", type: "text" },
];

// Split into two columns to mirror the original checklist's compact layout.
// Lights/wipers/logbook now live in the dedicated Pre-Service Checks section.
var FLUID_ROWS_COL1 = [
  { key: "engineFlush", label: "Engine Flush" },
  { key: "airFilter", label: "Air Filter" },
  { key: "cabinFilter", label: "Cabin Filter" },
  { key: "fuelFilter", label: "Fuel Filter" },
  { key: "brakeFluid", label: "Brake Fluid" },
  { key: "coolant", label: "Coolant" },
  { key: "clutchFluid", label: "Clutch Fluid" },
];

var FLUID_ROWS_COL2 = [
  { key: "sparkPlugs", label: "Spark Plugs" },
  { key: "transCaseOil", label: "Trans Case Oil" },
  { key: "autoOil", label: "Auto Oil" },
  { key: "manualOil", label: "Manual Oil" },
  { key: "fDiffOil", label: "F/Diff Oil" },
  { key: "rDiffOil", label: "R/Diff Oil" },
  { key: "driveBelts", label: "Drive Belts" },
];

var ABOVE_CAR_ITEMS = [
  { key: "brakeFluid", label: "Brake Fluid" },
  { key: "powerSteeringFluid", label: "PS Fluid" },
  { key: "clutchFluid", label: "Clutch Fluid" },
  { key: "battery", label: "Battery" },
  { key: "airFilter", label: "Air Filter" },
  { key: "coolant", label: "Coolant" },
  { key: "driveBelts", label: "Drive Belts" },
  { key: "washerLevel", label: "Washer Level" },
  { key: "transmissionOil", label: "Transmission Oil" },
];

var UNDER_CAR_ITEMS = [
  { key: "cvJoints", label: "CV Joints & Rack Boots" },
  { key: "wheelBearing", label: "Wheel Bearing & Tie Rods" },
  { key: "engineMounts", label: "Engine Mounts" },
  { key: "suspensionBushings", label: "Suspension Bushings" },
  { key: "struts", label: "Struts/Shock Absorbers" },
  { key: "exhaust", label: "Exhaust System" },
  { key: "oilLeaks", label: "Oil Leaks" },
  { key: "coolantLeaks", label: "Coolant Leaks" },
  { key: "transLeaks", label: "Trans/Gearbox Leaks" },
];

var WHEELS = [
  { key: "frontLeft", label: "Front Left", shortLabel: "FL" },
  { key: "frontRight", label: "Front Right", shortLabel: "FR" },
  { key: "rearLeft", label: "Rear Left", shortLabel: "RL" },
  { key: "rearRight", label: "Rear Right", shortLabel: "RR" },
];

// "tread" has 3 points across the tyre face (wear is often uneven);
// the other metrics are a single reading.
var WHEEL_METRICS = [
  {
    key: "tread",
    label: "Tyre tread (mm)",
    subFields: [
      { key: "outer", label: "O" },
      { key: "middle", label: "M" },
      { key: "inner", label: "I" },
    ],
  },
  { key: "pad", label: "Brake pad (mm)", subFields: [{ key: "value", label: "" }] },
  { key: "disc", label: "Brake disc (mm)", subFields: [{ key: "value", label: "" }] },
];

// Tyre pressure is set per axle, not per wheel.
var AXLES = [
  { key: "front", label: "Front" },
  { key: "rear", label: "Rear" },
];

// Compact wheel-measurement layout: Front/Rear as rows, Left/Right as
// paired tread columns, so the whole table fits in half the page width
// alongside Above Car.
var WHEEL_AXLE_ROWS = [
  { key: "front", label: "Front", left: "frontLeft", right: "frontRight" },
  { key: "rear", label: "Rear", left: "rearLeft", right: "rearRight" },
];

var TREAD_SUBFIELDS = [
  { key: "outer", label: "O" },
  { key: "middle", label: "M" },
  { key: "inner", label: "I" },
];

// Start-of-service pass/fail checks. Items with notes let the tech record
// e.g. the bulb type used; simple items are just a pass/fail toggle.
var PRE_SERVICE_FRONT_ITEMS = [
  { key: "park", label: "Park" },
  { key: "lowBeam", label: "Low Beam" },
  { key: "highBeam", label: "High Beam" },
  { key: "fogLights", label: "Fog Lights" },
  { key: "indicators", label: "Indicators" },
];

var PRE_SERVICE_REAR_ITEMS = [
  { key: "park", label: "Park" },
  { key: "plates", label: "Plates" },
  { key: "brakeLight", label: "Brake Light" },
  // "Reverse Light" wrapped onto a second line in the narrow rear column,
  // making that one row twice the height of every other. It's unambiguous on
  // its own in a lights checklist.
  { key: "reverseLight", label: "Reverse" },
  { key: "indicators", label: "Indicators" },
];

// Wipers are a plain pass/fail item (no note field), shown as the last row
// under their matching Front/Rear of Vehicle list so they line up with it.
var FRONT_WIPER_ITEM = { key: "frontWipers", label: "Front Wipers" };
var REAR_WIPER_ITEM = { key: "rearWipers", label: "Rear Wipers" };

// Logbook (3-way) and Engine Light (pass/fail) get their own small panel.
var LOGBOOK_ITEM = { key: "logbook", label: "Logbook" };
var ENGINE_LIGHT_ITEM = { key: "engineLight", label: "Engine Light" };

var STATUS_OPTIONS_PASS_FAIL = [
  { key: "pass", label: "✓", title: "Pass" },
  { key: "fail", label: "✗", title: "Fail" },
];

var STATUS_OPTIONS_LOGBOOK = [
  { key: "pass", label: "✓", title: "Pass" },
  { key: "fail", label: "✗", title: "Fail" },
  { key: "electronic", label: "E", title: "Electronic logbook" },
];

// Above Car condition rating: colour alone (green/orange/red), no letters.
var STATUS_OPTIONS_CONDITION = [
  { key: "good", label: "", title: "Good" },
  { key: "attention", label: "", title: "Needs attention" },
  { key: "due", label: "", title: "Due / suggest replacement" },
];

// Ruled-line guides drawn behind notes boxes (as real bordered divs, not a
// CSS gradient — html2canvas doesn't render gradients).
// Exactly the number of 24px lines that fit .notes-lined-wrap (260px). Was
// 12, which drew two-and-a-bit lines below the visible area — invisible, but
// it also meant the blank-line prefill below over-provisioned into space
// that could never be written on. Keep this in step with that CSS height.
var NOTES_LINE_INDEXES = Array.from({ length: 10 }, (_, i) => i);

// For boxes that flex-fill whatever space is left (height not known ahead of
// time) — generous enough to cover any realistic fill area; the wrap's
// overflow:hidden clips whatever doesn't fit.
var FILL_LINE_INDEXES = Array.from({ length: 40 }, (_, i) => i);

// How many ruled lines to DRAW behind a notes box. Deliberately far more than
// any box shows: the boxes scroll now, and the backdrop is scrolled in step
// with the text, so there have to be lines waiting below the fold or long
// notes would scroll onto blank paper. Unused ones cost nothing — the
// backdrop clips them. Separate from the *prefill* counts above, which decide
// how many blank lines a box starts with.
var RULE_DRAW_INDEXES = Array.from({ length: 60 }, (_, i) => i);

// A plain empty textarea can only place the cursor at position 0 — clicking
// a blank ruled line further down just snaps back to the top, since there's
// no actual content there yet. Pre-filling with blank lines (newlines only,
// invisible on screen) gives every ruled line real content to click into,
// so techs can start writing on any line, not just the first.
var NOTES_BLANK_VALUE = Array(NOTES_LINE_INDEXES.length).fill("").join("\n");
var FILL_BLANK_VALUE = Array(FILL_LINE_INDEXES.length).fill("").join("\n");

// Probable cause and Recommendation are short by design — the technician
// writes the detail under Findings, and these two are the lines the quote is
// actually built from, so they stay tight enough to read at a glance.
var DIAGNOSIS_LINE_INDEXES = Array.from({ length: 3 }, (_, i) => i);
var DIAGNOSIS_BLANK_VALUE = Array(DIAGNOSIS_LINE_INDEXES.length).fill("").join("\n");

// Rows in the diagnostic time log and the fault-code list. Kept modest: real
// jobs do run to ten-plus labour entries, but the card is one A4 sheet and
// the common case is one or two sittings.
var DIAGNOSTIC_TIME_ROWS = 5;
var FAULT_CODE_ROWS = 4;

// Compact per-item notes (e.g. one damage-diagram view) — enough room to
// actually write something without eating the whole page.
var DIAGRAM_NOTES_LINE_INDEXES = Array.from({ length: 5 }, (_, i) => i);
var DIAGRAM_NOTES_BLANK_VALUE = Array(DIAGRAM_NOTES_LINE_INDEXES.length).fill("").join("\n");

// Photos page(s): as many photos per sheet as comfortably fit an A4 page;
// extra photos spill onto further "Page 3", "Page 4"... sheets.
var PHOTOS_PER_PAGE = 6;
var PHOTO_MAX_DIMENSION = 1200;
var PHOTO_JPEG_QUALITY = 0.82;

// Pre-Purchase Inspection: five angles so damage gets circled on the view
// that actually shows it (a scratch on the front bumper is unreadable
// circled on a bird's-eye outline).
var PPI_DIAGRAM_VIEWS = [
  { key: "birdsEye", label: "Birds-Eye View" },
  { key: "front", label: "Front View" },
  { key: "rear", label: "Rear View" },
  { key: "left", label: "Left Side View" },
  { key: "right", label: "Right Side View" },
];

var KEYS_OPTIONS = [
  { key: "1", label: "1", title: "1 key" },
  { key: "2", label: "2", title: "2 keys" },
  { key: "3", label: "3", title: "3 keys" },
];

// Short single-letter labels — "Full"/"Partial"/"None" as literal button
// text overflowed the compact status-btn box. The full words are spelled
// out as a hint next to the Logbook label instead (see ppi-checks-panel).
var PPI_LOGBOOK_OPTIONS = [
  { key: "full", label: "F", title: "Full — 100% up to date" },
  { key: "partial", label: "P", title: "Partial — partially up to date" },
  { key: "none", label: "N", title: "None — not up to date / missing stamps" },
  { key: "electronic", label: "E", title: "Electronic logbook" },
];

var PPSR_OPTIONS = [
  { key: "clear", label: "Clear", title: "No finance / write-off / stolen history found" },
  { key: "flagged", label: "Flagged", title: "Finance owing, write-off, or stolen history found" },
];

// Short code identifying a card for live sync (shared between the tech's
// tablet and the office's "view/edit" link). Excludes visually ambiguous
// characters (0/O, 1/I/L) since it's read aloud / typed by hand sometimes.
var CARD_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function generateCardCode() {
  var code = "";
  for (var i = 0; i < 6; i++) {
    code += CARD_CODE_CHARS[Math.floor(Math.random() * CARD_CODE_CHARS.length)];
  }
  return code;
}

// Switchable sections. The card is one modular sheet rather than a set of
// fixed templates: a car in for a diagnosis and no service is the same card
// with the service sections switched off, and a service that turns into a
// diagnosis mid-job gets the diagnostics section switched on without
// starting anything new.
//
// Detection of "this is a diagnostics job" is deliberately NOT automated.
// Checked against the real AMS Bookings calendar: about half of genuine
// diagnostic bookings contain no "diag"/"diagnosis" word anywhere ("Cooling
// System Concern", "CEL/Brake issue", "dash board lights & headlights"), so
// a keyword rule would miss them and fire on ordinary repairs. A person
// decides, with one tap.
//
// `hasContent` answers "would switching this off hide real work?" — used to
// confirm before hiding, and to warn on screen when a hidden section still
// holds entries (hiding never deletes, so that content is invisible on the
// printed card unless it is switched back on).
var SECTION_DEFS = [
  {
    id: "fluids",
    label: "Fluids & Filters",
    default: true,
    hasContent: function (s) {
      return Object.keys(s.fluids || {}).some(function (k) {
        return s.fluids[k].checked || (s.fluids[k].value || "").trim();
      });
    },
  },
  {
    id: "preService",
    label: "Pre-Service Checks",
    default: true,
    hasContent: function (s) {
      var ps = s.preService || {};
      return ["front", "rear"].some(function (side) {
        return Object.keys(ps[side] || {}).some(function (k) {
          return ps[side][k].status || (ps[side][k].note || "").trim();
        });
      });
    },
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    default: false,
    hasContent: function (s) {
      var d = s.diagnostics || {};
      return (
        hasInk(d.findings) ||
        hasInk(d.cause) ||
        hasInk(d.recommendation) ||
        (d.timeLog || []).some(function (r) {
          return (r.date || "").trim() || (r.hours || "").trim();
        })
      );
    },
  },
  {
    id: "faultCodes",
    label: "Fault Codes",
    default: false,
    hasContent: function (s) {
      return ((s.diagnostics || {}).faultCodes || []).some(function (r) {
        return (r.code || "").trim() || (r.description || "").trim() || (r.status || "").trim();
      });
    },
  },
  {
    id: "quote",
    label: "Quote",
    default: false,
    hasContent: function (s) {
      return ((s.quote || {}).items || []).some(function (r) {
        return (r.desc || "").trim() || (r.sell || "").trim() || (r.cost || "").trim();
      });
    },
  },
  {
    id: "aboveCar",
    label: "Above Car",
    default: true,
    hasContent: function (s) {
      return Object.keys(s.aboveCar || {}).some(function (k) {
        return s.aboveCar[k].status || hasInk(s.aboveCar[k].note);
      });
    },
  },
  {
    id: "wheels",
    // One control covers the whole measurements block — wheel treads, brake
    // pads, tyre pressure and tyre size — because they are one physical walk
    // around the car, not four separate decisions.
    label: "Wheel Measurements",
    default: true,
    // Walked generically rather than field by field: wheels nests three deep
    // (wheel -> metric -> sub-field), and a hand-written two-level loop threw
    // on the sub-field objects.
    hasContent: function (s) {
      return anyTextIn(s.wheels) || anyTextIn(s.tyrePressure) || anyTextIn(s.tyreSize);
    },
  },
  {
    id: "underCar",
    label: "Under Car",
    default: true,
    hasContent: function (s) {
      return Object.keys(s.underCar || {}).some(function (k) {
        return hasInk(s.underCar[k]);
      });
    },
  },
];

// Notes boxes are pre-filled with blank ruled lines so every line is
// clickable, so "not empty" is not the same as "has something written in
// it" — strip tags and blank lines before deciding.
// True if any string anywhere in a nested state slice has something typed in
// it. Walks whatever shape it is handed, so it can't be broken by a slice
// nesting deeper than a hand-written loop expected.
function anyTextIn(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return !!value;
  if (Array.isArray(value)) return value.some(anyTextIn);
  if (typeof value === "object") {
    return Object.keys(value).some(function (k) {
      return anyTextIn(value[k]);
    });
  }
  return false;
}

function hasInk(value) {
  if (!value) return false;
  return String(value)
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .trim().length > 0;
}

function buildDefaultSections() {
  var sections = {};
  SECTION_DEFS.forEach(function (def) {
    sections[def.id] = def.default;
  });
  return sections;
}

function buildInitialState() {
  var fluids = {};
  FLUID_ROWS_COL1.concat(FLUID_ROWS_COL2).forEach(function (row) {
    fluids[row.key] = { checked: false, checkedBy: "", value: "", valueBy: "" };
  });

  var header = {};
  var headerBy = {};
  HEADER_FIELDS.forEach(function (f) {
    header[f.key] = "";
    headerBy[f.key] = "";
  });

  var oilSpec = {};
  var oilSpecBy = {};
  OIL_SPEC_FIELDS.forEach(function (f) {
    oilSpec[f.key] = "";
    oilSpecBy[f.key] = "";
  });

  var aboveCar = {};
  ABOVE_CAR_ITEMS.forEach(function (item) {
    aboveCar[item.key] = { status: "", note: "", noteBy: "" };
  });

  var underCar = {};
  var underCarBy = {};
  UNDER_CAR_ITEMS.forEach(function (item) {
    underCar[item.key] = "";
    underCarBy[item.key] = "";
  });

  var wheels = {};
  WHEELS.forEach(function (wheel) {
    var metrics = {};
    WHEEL_METRICS.forEach(function (metric) {
      var sub = {};
      metric.subFields.forEach(function (sf) {
        sub[sf.key] = "";
      });
      metrics[metric.key] = sub;
    });
    wheels[wheel.key] = metrics;
  });

  var tyrePressure = {};
  AXLES.forEach(function (axle) {
    tyrePressure[axle.key] = "";
  });

  // Tyre size (e.g. "225/45R17") — tech-recorded so the office knows what
  // to order when a tyre needs replacing. Two boxes since cars sometimes
  // run staggered sizes (front ≠ rear).
  var tyreSize = {};
  AXLES.forEach(function (axle) {
    tyreSize[axle.key] = "";
  });

  var front = {};
  PRE_SERVICE_FRONT_ITEMS.forEach(function (item) {
    front[item.key] = { status: "", note: "", noteBy: "" };
  });

  var rear = {};
  PRE_SERVICE_REAR_ITEMS.forEach(function (item) {
    rear[item.key] = { status: "", note: "", noteBy: "" };
  });

  var preService = { front: front, rear: rear };
  preService[FRONT_WIPER_ITEM.key] = { status: "", note: "", noteBy: "" };
  preService[REAR_WIPER_ITEM.key] = { status: "", note: "", noteBy: "" };
  preService[LOGBOOK_ITEM.key] = { status: "" };
  preService[ENGINE_LIGHT_ITEM.key] = { status: "" };

  return {
    header: header,
    headerBy: headerBy,
    oilSpec: oilSpec,
    oilSpecBy: oilSpecBy,
    fluids: fluids,
    preService: preService,
    aboveCar: aboveCar,
    underCar: underCar,
    underCarBy: underCarBy,
    wheels: wheels,
    tyrePressure: tyrePressure,
    tyreSize: tyreSize,
    sections: buildDefaultSections(),
    diagnostics: buildInitialDiagnostics(),
    quote: buildInitialQuote(),
  };
}

// The quote is drafted from the card and sent to the customer by SMS; the
// customer approves by replying. Approval deliberately stays off the card —
// no customer login, no approve button, no portal.
//
// Each line carries what the customer is charged and what it cost us,
// matching how Ricky already writes quotes ("Radiator 230/131.91"), and the
// margin is shown. He asked for it explicitly, knowing he reads the card in
// front of the customer at pickup: "just do it.. if its too obvious then ill
// remove it later" — so keep it easy to hide (the .quote-margin class alone).
function buildInitialQuote() {
  return {
    items: buildBlankRows(QUOTE_ROWS, { desc: "", sell: "", cost: "" }),
  };
}

var QUOTE_ROWS = 6;

// Diagnostics is a written record, not a checklist — you cannot pre-list what
// you are looking for until you have looked. The structure comes from the
// stages of a diagnosis, confirmed against a real job (the 1UQ3XT Subaru):
// the technician writes what was checked, then the probable cause separately
// (the quote is written off the cause, not the finding), then what he
// recommends.
//
// The time log exists because a diagnosis is often not one sitting — real
// jobs on this calendar accumulate ten or more labour entries across weeks
// ("Diagnostic time 1.5hours 11:30am-1pm", "Labour 2.5hours 28/10/24").
function buildInitialDiagnostics() {
  return {
    findings: FILL_BLANK_VALUE,
    findingsBy: "",
    cause: DIAGNOSIS_BLANK_VALUE,
    causeBy: "",
    recommendation: DIAGNOSIS_BLANK_VALUE,
    recommendationBy: "",
    timeLog: buildBlankRows(DIAGNOSTIC_TIME_ROWS, { date: "", hours: "", note: "" }),
    // Free text status rather than a preset list — Ricky writes it himself
    // ("P0125 - Cat converter bank 1 sensor 2 too rich (active)") and the
    // wording varies.
    faultCodes: buildBlankRows(FAULT_CODE_ROWS, { code: "", description: "", status: "" }),
  };
}

function buildBlankRows(count, shape) {
  var rows = [];
  for (var i = 0; i < count; i++) rows.push(Object.assign({}, shape));
  return rows;
}
