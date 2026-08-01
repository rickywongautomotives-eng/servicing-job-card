// Shared local persistence for saved job cards — lets a tech save an
// unfinished card and resume it later, and gives the office a list of
// in-progress / completed cards to track. Local-device only (localStorage),
// no network sync yet: that lands once Firebase is set up (still parked).
// Until then, "Approve" exports the PDF the same way the export button
// already does and removes the card from this device's list — getting it
// onto the office computer is still a manual step (open the exported PDF)
// rather than automatic.

var JOBCARDS_STORAGE_KEY = "servicing_jobcards_v1";

var TEMPLATE_LABELS = {
  "general-service": "General Service",
  "pre-purchase-inspection": "Pre-Purchase Inspection",
};

function generateJobId() {
  return Date.now() + "-" + Math.random().toString(36).slice(2);
}

function loadSavedJobs() {
  try {
    var raw = localStorage.getItem(JOBCARDS_STORAGE_KEY);
    if (!raw) return [];
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to read saved job cards", err);
    return [];
  }
}

function writeSavedJobs(jobs) {
  localStorage.setItem(JOBCARDS_STORAGE_KEY, JSON.stringify(jobs));
}

// Throws if the write fails (e.g. storage quota exceeded from lots of
// photos) so the caller can tell the tech rather than silently losing data.
function saveJob(job) {
  var jobs = loadSavedJobs();
  var idx = jobs.findIndex(function (j) {
    return j.id === job.id;
  });
  if (idx === -1) {
    jobs.push(job);
  } else {
    jobs[idx] = job;
  }
  writeSavedJobs(jobs);
}

function deleteJob(id) {
  var jobs = loadSavedJobs().filter(function (j) {
    return j.id !== id;
  });
  writeSavedJobs(jobs);
}

// Derives a human-readable label for the saved-jobs list from whatever
// header fields are actually filled in — customer + vehicle reads best,
// but falls back gracefully for a card that's barely been started.
function buildJobLabel(header) {
  var customer = (header.customer || "").trim();
  var vehicle = [header.make, header.model].filter(Boolean).join(" ").trim();
  if (customer && vehicle) return customer + " — " + vehicle;
  if (customer) return customer;
  if (vehicle) return vehicle;
  if (header.registration && header.registration.trim()) return header.registration.trim();
  return "Untitled job";
}
