const m = require("./ezyparts.js");
let bad = 0;
const check = (got, want, label) => {
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? "ok  " : "FAIL") + "  " + label + "  ->  " + JSON.stringify(got) + (ok ? "" : "  want " + JSON.stringify(want)));
};

// --- shortOilSpec, against the real notes strings off the cards ---
check(
  m.shortOilSpec("TG7580", "1.9L Capacity ; Full Synthetic, SAE 75W-80, API GL-4 PLUS"),
  "TG7580 75W-80 GL4 - 1.9L",
  "gear oil"
);
check(
  m.shortOilSpec("EPLUS5W30", "--> 2020, 5.7L Capacity ; Full Synthetic, SAE 5W-30, ACEA C3, VW 504 00/ 507 00 Approved, Engine Oil"),
  "EPLUS5W30 - 5.7L",
  "engine oil, viscosity embedded in code"
);
check(
  m.shortOilSpec("HPR0", "5.3L Capacity, Use from Batch Number V042490 Onwards ; Full Synthetic, SAE 0W-30, API SP, ACEA A5/B5, Engine Oil"),
  "HPR0 0W-30 - 5.3L",
  "engine oil, viscosity not in code"
);
check(m.shortOilSpec("SDOT4005", "500mL Capacity ; DOT 4 Brake Fluid"), "SDOT4005 - 500mL", "brake fluid, rating already in code");
check(m.shortOilSpec("COOL1", ""), "COOL1", "no notes at all");

// --- autoOil heading, the real name from the log ---
const auto = m.FIELD_RULES.find((r) => r.field === "autoOil");
check(auto.match.test("Automatic Trans Fluid"), true, "autoOil matches 'Automatic Trans Fluid'");
check(auto.match.test("Auto Trans Fluid"), true, "autoOil matches 'Auto Trans Fluid'");
check(auto.match.test("Automatic Transmission Fluid"), true, "autoOil matches long form");
check(auto.match.test("Automatic Trans Filter"), false, "filter heading must NOT match autoOil");
check(auto.match.test("Automatic Trans Oil Cooler"), false, "oil cooler must NOT match autoOil");
// DSG/DCT cars (DMC472): fluid is filed under "DCT Transmission Fluid", must
// land in the Auto Oil row -- but the DCT hardware/seals beside it must not.
check(auto.match.test("DCT Transmission Fluid"), true, "autoOil matches 'DCT Transmission Fluid' (DSG car)");
check(auto.match.test("DSG Transmission Fluid"), true, "autoOil matches 'DSG Transmission Fluid'");
check(auto.match.test("Dual Clutch Transmission Fluid"), true, "autoOil matches 'Dual Clutch Transmission Fluid'");
check(auto.match.test("Man/DCT/AMT Trans Front Seal"), false, "DCT seal must NOT match autoOil");
check(auto.match.test("Man/DCT/AMT Trans Drive Shaft Seal"), false, "DCT shaft seal must NOT match autoOil");

// --- diff look-aheads, both word orders ---
const fd = m.FIELD_RULES.find((r) => r.field === "fDiffOil");
check(fd.match.test("Front Differential Oil"), true, "front diff, name first");
check(fd.match.test("Differential Oil - Front"), true, "front diff, side last");
check(fd.match.test("Rear Differential Oil"), false, "front rule ignores rear");

// --- the collision: two id-less oil families must keep their own picks ---
const payload = {
  categories: [
    { name: "Engine Oil", parts: [{ name: "EPLUS5W30", brand: "Penrite", notes: "5.7L Capacity ; SAE 5W-30", code: "" }] },
    { name: "Manual Transmission Oil", parts: [{ name: "TG7580", brand: "Penrite", notes: "1.9L Capacity ; SAE 75W-80, API GL-4 PLUS", code: "" }] },
    { name: "Brake Fluid", parts: [{ name: "SDOT4005", brand: "Penrite", notes: "500mL Capacity ; DOT 4", code: "" }] },
  ],
};
const picked = m.pickParts(payload);
check(picked.fields.oilGrade.code, "EPLUS5W30", "engine oil keeps its own pick");
check(picked.fields.manualOil.code, "TG7580", "manual oil keeps its own pick");
check(picked.fields.brakeFluid.code, "SDOT4005", "brake fluid keeps its own pick");
check(picked.fields.manualOil.display, "TG7580 75W-80 GL4 - 1.9L", "display attached, viscosity included (no W in code)");

// --- false-positive sweep against every real heading from the UJF787 log ---
const REAL_HEADINGS = ["Oil Filter","Air Filter","Fuel Filter","Cabin Air Filter","Engine Oil","Oil Sump Plug Gasket/Washer/Seal","Oil Sump Plug & Gasket/Washer/Seal","Automatic Trans Filter","Automatic Trans Fluid","Manual Transmission Oil","Engine Coolant / Antifreeze Fluid","Brake Fluid","Power Steering Fluid","Belt - Serpentine Belt","Spark Plug","Battery","Front Brake Pads","Disc Rotor - Front","Rear Brake Pads","Disc Rotor - Rear","Wiper Blade - Driver","Wiper Blade - Passenger","Wiper Blade Set","Filter Removal Cup","Transmission Service Tools & Kits","Fuel Pump/Sender Removal Tool","Intake System Cleaner","Clutch Hydraulic Fluid","Disc Caliper - Front","Disc Caliper Piston - Front","Disc Caliper Repair Kit - Front","Disc Caliper - Rear","Parking Brake Shoe","Hydraulic Hose - Front","Brake Master Cylinder","ABS Wheel Speed Sensor - Front","Drive Belt Tensioner/Idler Layout","Drive Belt Tensioner Assembly","Drive Belt Tensioner Pulley","Drive Belt Idler Pulley","Timing Chain Kit","Water Pump","Harmonic Balancer/TVD","Crankshaft Front Seal","Thermostat & Housing Assembly","Radiator Upper Hose","Heater Hose","Engine Bypass Hose","Throttle Body Coolant Hose","Radiator Cap","Radiator","Cooling Fan Assembly","Automatic Trans Oil Cooler","Ignition Coil","Starter Motor","Alternator","Wheel Bearing Kit - Front","Wheel Stud & Nut Set","CV Joint Outer","CV Joint Boot Kit","Drive Shaft - Transverse/CV Shaft","Drive Shaft Seal","Clutch Kit","Crankshaft Rear Seal (Rear Main Seal)","Clutch Master Cylinder","Clutch Hydraulic Fluid","Clutch Slave Cylinder","Automatic Trans Axle Shaft Seal","Automatic Trans Selector Shaft Seal","Automatic Trans Torque Converter Seal","Man/DCT/AMT Trans Drive Shaft Seal","Man/DCT/AMT Trans Front Seal"];
const WANT = {
  "Oil Filter": "oilFilter",
  "Engine Oil": "oilGrade",
  "Air Filter": "airFilter",
  "Cabin Air Filter": "cabinFilter",
  "Fuel Filter": "fuelFilter",
  "Brake Fluid": "brakeFluid",
  "Engine Coolant / Antifreeze Fluid": "coolant",
  "Clutch Hydraulic Fluid": "clutchFluid",
  "Spark Plug": "sparkPlugs",
  "Belt - Serpentine Belt": "driveBelts",
  "Automatic Trans Fluid": "autoOil",
  "Manual Transmission Oil": "manualOil",
};
// Every matching rule fires now, so compare the full SET of fields a heading
// claims, not just the first.
const fieldsFor = (h) => m.FIELD_RULES.filter((r) => r.match.test(h)).map((r) => r.field).sort().join("+") || null;
REAL_HEADINGS.forEach((h) => {
  const got = fieldsFor(h);
  const want = WANT[h] || null;
  if (got !== want) {
    bad++;
    console.log("FAIL  heading " + JSON.stringify(h) + " -> " + got + "  want " + want);
  }
});
console.log("UJF787 heading sweep done (" + REAL_HEADINGS.length + " headings)");

// --- Pajero (1FG2NP) headings: the 4WD set that caught the diff bug ---
const PAJERO = {
  "Differential Oil": "fDiffOil+rDiffOil",
  "Transfer Case Oil": "transCaseOil",
  "Differential Mount - Front": null,
  "Differential Mount Bush - Rear": null,
  "Differential Seal": null,
  "Pinion Seal": null,
  "Belt - Alternator": "driveBelts",
  "Belt - A/C": "driveBelts",
  "Timing Belt": null,
  "Automatic Trans Filter Kit": null,
  "Crankcase (PCV) Oil/Air Separator Filter (Catch Can) Assembly": null,
  "Fuel Water Separator Filter": null,
  "Front Differential Oil": "fDiffOil",
  "Differential Oil - Rear": "rDiffOil",
};
Object.keys(PAJERO).forEach((h) => {
  const got = fieldsFor(h);
  if (got !== PAJERO[h]) {
    bad++;
    console.log("FAIL  pajero heading " + JSON.stringify(h) + " -> " + got + "  want " + PAJERO[h]);
  }
});
console.log("Pajero heading sweep done");

// Several accessory belts join into one row; the same code twice does not.
const beltPayload = {
  categories: [
    { name: "Belt - Alternator", parts: [{ name: "6PK2260", brand: "Dayco", code: "901" }] },
    { name: "Belt - A/C", parts: [{ name: "4PK1120", brand: "Dayco", code: "902" }] },
    { name: "Belt - Serpentine Belt", parts: [{ name: "6PK2260", brand: "Dayco", code: "901" }] },
  ],
};
check(m.pickParts(beltPayload).fields.driveBelts.display, "6PK2260 / 4PK1120", "two belts joined, duplicate skipped");
const oneBelt = {
  categories: [{ name: "Belt - Serpentine Belt", parts: [{ name: "7PK1750", brand: "Dayco", code: "903" }] }],
};
check(m.pickParts(oneBelt).fields.driveBelts.display, "7PK1750", "single belt unchanged");

// One un-sided heading must fill BOTH diff rows with the same oil.
const diffPayload = {
  categories: [{ name: "Differential Oil", parts: [{ name: "PROG7585", brand: "Penrite", notes: "75W-85 GL-5", code: "" }] }],
};
const dp = m.pickParts(diffPayload).fields;
check(dp.fDiffOil && dp.fDiffOil.code, "PROG7585", "front diff filled from un-sided heading");
check(dp.rDiffOil && dp.rDiffOil.code, "PROG7585", "rear diff filled from un-sided heading");

// --- DOT rules ---
check(m.shortOilSpec("DOT 4", "500mL Capacity ; DOT 4 Brake Fluid"), "DOT 4 - 500mL", "no duplicate when name IS the rating");
check(m.shortOilSpec("SDOT4005", "500mL Capacity ; DOT 4"), "SDOT4005 - 500mL", "no duplicate when rating is inside the code");
check(m.shortOilSpec("BF500", "500mL Capacity ; DOT 4"), "BF500 DOT4 - 500mL", "rating added when code lacks it");

const mixed = [
  { code: "DOT 3", brand: "Penrite", notes: "500mL ; DOT 3" },
  { code: "DOT 4", brand: "Penrite", notes: "500mL ; DOT 4" },
  { code: "SIL5", brand: "Penrite", notes: "500mL ; DOT 5 silicone" },
];
check(m.dot4Minimum(mixed).map((p) => p.code).join(","), "DOT 4", "DOT3 and silicone DOT5 excluded, DOT4 kept");
check(m.dot4Minimum([{ code: "DOT 3", brand: "Penrite", notes: "DOT 3" }]).length, 0, "DOT3-only listing -> empty (row stays blank)");
check(
  m.dot4Minimum([{ code: "DOT 5.1", brand: "Penrite", notes: "DOT 5.1" }]).map((p) => p.code).join(","),
  "DOT 5.1",
  "DOT 5.1 accepted"
);
const payload2 = {
  categories: [
    { name: "Brake Fluid", parts: [
      { name: "DOT 3", brand: "Penrite", notes: "500mL Capacity ; DOT 3", code: "" },
      { name: "DOT 4", brand: "Penrite", notes: "500mL Capacity ; DOT 4", code: "" },
    ] },
  ],
};
check(m.pickParts(payload2).fields.brakeFluid.code, "DOT 4", "picker prefers DOT4 even when DOT3 is listed first");
const payload3 = {
  categories: [{ name: "Brake Fluid", parts: [{ name: "DOT 3", brand: "Penrite", notes: "DOT 3", code: "" }] }],
};
check("brakeFluid" in m.pickParts(payload3).fields, false, "DOT3-only heading fills nothing");

// Penrite's family row is literally named "BF" -- display must be the rating.
const payload4 = {
  categories: [
    { name: "Brake Fluid", parts: [{ name: "BF", brand: "Penrite", notes: "DOT 4 Brake Fluid", code: "" }] },
    { name: "Clutch Hydraulic Fluid", parts: [{ name: "BF", brand: "Penrite", notes: "500mL Capacity ; DOT 4", code: "" }] },
  ],
};
const p4 = m.pickParts(payload4).fields;
check(p4.brakeFluid.display, "DOT4", "brake row shows the rating alone");
check(p4.clutchFluid.display, "DOT4 - 500mL", "clutch row shows rating and capacity");
check(m.pickParts(payload2).fields.brakeFluid.display, "DOT4 - 500mL", "named-DOT4 family also displays as rating");

console.log(bad ? bad + " FAILED" : "all passed");
process.exitCode = bad ? 1 : 0;


// --- vehicle detail parsing (transmission / drive / compliance) ---
const bmw = { lngDsc: 'BMW 330i TOURING Auto G21 07/2019~07/2022 4 Door Wagon RWD PETROL 2.0 litre, B48B20B I4 16v DOHC VVT I/C Turbo Direct Inj {190kW} ', details: 'TOURING,  4D Wagon, RWD WBA6K520  [GERMANY], AT' };
check(m.transmissionOf(bmw), 'Auto', 'transmission from lngDsc word');
check(m.driveOf(bmw), 'RWD', 'drive from lngDsc');
check(m.transmissionOf({ details: 'X, 4D Sedan, FWD ABC  [JAPAN], MT' }), 'Manual', 'transmission from details MT code');
check(m.driveOf({ details: 'X, 4D Sedan, FWD ABC [JAPAN], MT' }), 'FWD', 'drive from details');
check(m.transmissionOf({ lngDsc: 'HONDA ACCORD EURO Manual 6 Speed ...' }), 'Manual', 'manual word');
check(m.transmissionOf({ lngDsc: 'SUBARU XV CVT ...' }), 'CVT', 'CVT kept as-is');
check(m.driveOf({ lngDsc: 'MITSUBISHI PAJERO ... 4WD DIESEL' }), '4WD', '4WD');
check(m.transmissionOf({}), '', 'no data, no guess');
check(m.complianceDisplay('2022-09'), '09/22', 'compliance YYYY-MM to MM/YY');
check(m.complianceDisplay('2019-4'), '04/19', 'single-digit month padded');
check(m.complianceDisplay(''), '', 'empty compliance stays empty');

console.log(bad ? bad + ' FAILED (with vehicle details)' : 'all passed (with vehicle details)');
process.exitCode = bad ? 1 : 0;
