// Cloud sync for saved job cards, layered on top of the local save/resume
// system in storage.js (which stays as the always-available, offline-first
// copy on each device). This file is what makes the same job list show up
// live across every tablet and the office computer.
//
// Scope of this phase: everything about a job syncs EXCEPT photo image
// data. Firestore documents have a hard 1 MiB size limit, and a handful of
// resized photos as base64 easily blows past that — photos need to go into
// Cloud Storage (separate upload pipeline), not Firestore, which hasn't
// been built yet. Until then, photos stay local to whichever device took
// them; every other field (checklist answers, notes, formatting, statuses)
// syncs live.

// Offline persistence (queues writes in IndexedDB while offline, replays
// them once back online) was tried here via enablePersistence(), but it
// caused "database is closing" failures during Google sign-in specifically
// on Android Chrome (not desktop) — almost certainly IndexedDB lock
// contention between Firestore's persistence layer and Auth's own storage
// use during the sign-in handshake. Turned off: local saves (storage.js)
// remain fully safe offline regardless; the only loss is that a cloud sync
// write made while offline won't auto-retry once back online — the user
// would need to hit Save/Approve again.

function jobsCollection() {
  return firebase.firestore().collection("jobs");
}

// Deep-clones a job's state and blanks out photo image data before it goes
// to Firestore — handles both General Service's flat `photos` array and
// PPI's per-view `diagrams.<key>.photos` arrays. `id`/`syncedLocally` are
// kept so the UI can tell "this photo exists, just not on this device"
// apart from "no photo was ever taken here".
// Deliberately does NOT deep-clone: live sync calls this on every keystroke
// to diff the card, and JSON-cloning multi-megabyte base64 photo strings
// that are about to be thrown away made typing stutter. Shallow copies plus
// fresh arrays/objects only where photos actually get replaced is enough to
// leave the caller's state untouched.
function photoStub(p) {
  return { id: p.id, dataUrl: null, syncedLocally: true };
}

function stripPhotosForSync(state) {
  var copy = Object.assign({}, state || {});
  if (Array.isArray(copy.photos)) {
    copy.photos = copy.photos.map(photoStub);
  }
  if (copy.diagrams) {
    var diagrams = {};
    Object.keys(copy.diagrams).forEach(function (key) {
      var view = copy.diagrams[key];
      diagrams[key] =
        view && Array.isArray(view.photos)
          ? Object.assign({}, view, { photos: view.photos.map(photoStub) })
          : view;
    });
    copy.diagrams = diagrams;
  }
  return copy;
}

// Pushes a job to Firestore. Returns the promise so callers can react to a
// genuine failure (not just "offline" — enablePersistence already handles
// that transparently by queueing the write).
function syncSaveJob(job, userEmail) {
  return jobsCollection()
    .doc(job.id)
    .set({
      template: job.template,
      status: job.status,
      label: job.label,
      savedAt: job.savedAt,
      updatedBy: userEmail || "",
      state: stripPhotosForSync(job.state),
    });
}

function syncDeleteJob(id) {
  return jobsCollection().doc(id).delete();
}

// Live-subscribes to the whole jobs list — fires immediately with whatever
// is cached (including offline-queued local changes), then again every time
// anything changes anywhere (this device, another tablet, or the office
// computer). Returns the unsubscribe function.
function subscribeToJobs(onChange, onError) {
  return jobsCollection().onSnapshot(function (snapshot) {
    var jobs = snapshot.docs.map(function (doc) {
      return Object.assign({ id: doc.id }, doc.data());
    });
    onChange(jobs);
  }, onError);
}

// ---------- Live per-card sync (tech tablet <-> office desktop) ----------
//
// subscribeToJobs above watches the whole LIST (which card is in which
// column). These next few are what make a single OPEN card update live
// while two people are editing it at once.
//
// The important part is that edits are written as individual field paths
// rather than as one whole `state` blob. If both sides wrote the entire
// document, whoever saved last would silently wipe the other's work — the
// office correcting a customer's phone number would erase whatever the tech
// ticked in the 3 seconds before. Writing only what actually changed lets
// Firestore merge the two edits server-side.

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Walks two versions of the state and returns a flat map of
// { "state.header.customer": "Bob", ... } for every leaf that differs.
// Arrays are treated as single leaves (photo lists, evaluation rows) — item
// level merging inside an array isn't meaningful here and would be fragile.
function collectChangedPaths(prev, next, prefix, out) {
  out = out || {};
  var keys = {};
  Object.keys(prev || {}).forEach(function (k) { keys[k] = true; });
  Object.keys(next || {}).forEach(function (k) { keys[k] = true; });
  Object.keys(keys).forEach(function (k) {
    var a = prev ? prev[k] : undefined;
    var b = next ? next[k] : undefined;
    var path = prefix ? prefix + "." + k : k;
    if (isPlainObject(a) && isPlainObject(b)) {
      collectChangedPaths(a, b, path, out);
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      // Firestore rejects undefined outright; nothing in this app's state
      // legitimately goes from "present" to "absent", so null is a safe
      // stand-in for the rare case where a key disappears.
      out[path] = b === undefined ? null : b;
    }
  });
  return out;
}

function pathIsSkipped(path, skipPaths) {
  if (!skipPaths) return false;
  var keys = Object.keys(skipPaths);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    // Skip if it's the same field, or either side is a parent of the other
    // (e.g. local edited "fluids.airFilter.value", remote changed
    // "fluids.airFilter" wholesale).
    if (path === k || path.indexOf(k + ".") === 0 || k.indexOf(path + ".") === 0) return true;
  }
  return false;
}

// Produces a new local state with only the leaves that CHANGED REMOTELY
// taken from the remote copy — everything else keeps whatever this device
// has. skipPaths protects fields this user has edited but not yet flushed,
// so an in-flight local edit never gets yanked out from under them.
function mergeRemoteChanges(local, prevRemote, nextRemote, skipPaths, prefix) {
  if (!isPlainObject(nextRemote)) return nextRemote;
  var out = Object.assign({}, isPlainObject(local) ? local : {});
  Object.keys(nextRemote).forEach(function (k) {
    var path = prefix ? prefix + "." + k : k;
    var a = prevRemote ? prevRemote[k] : undefined;
    var b = nextRemote[k];
    if (isPlainObject(a) && isPlainObject(b)) {
      out[k] = mergeRemoteChanges(out[k], a, b, skipPaths, path);
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
      if (!pathIsSkipped(path, skipPaths)) out[k] = b;
    }
  });
  return out;
}

// Live-subscribes to ONE job document. onChange receives (data,
// hasPendingWrites). Note that hasPendingWrites means "this snapshot
// includes SOME unacknowledged local write" — it does not mean the snapshot
// is purely this device's own echo, so it must not be used to filter
// snapshots out (doing so drops the other side's edits whenever they arrive
// while a local edit is in flight). Callers should diff instead.
function subscribeToJob(jobId, onChange, onError) {
  return jobsCollection()
    .doc(jobId)
    .onSnapshot(function (doc) {
      if (!doc.exists) return;
      onChange(doc.data(), doc.metadata.hasPendingWrites);
    }, onError);
}

// Writes just the changed field paths. update() (not set()) so untouched
// fields are left exactly as they are on the server.
function syncPatchJob(jobId, patch) {
  return jobsCollection().doc(jobId).update(patch);
}

// Backs up the finished PDF itself to Cloud Storage on Approve — separate
// from syncSaveJob, which only ever carries the job's structured data.
// Storage has no offline queueing the way enablePersistence gives Firestore,
// so this can genuinely fail while offline; callers should keep the job
// around (not delete it) until this resolves, so nothing gets lost.
function uploadJobPdf(jobId, blob) {
  var ref = firebase.storage().ref().child("job-pdfs/" + jobId + ".pdf");
  return ref.put(blob, { contentType: "application/pdf" }).then(function () {
    return ref.getDownloadURL();
  });
}

// Permanent record of an approved job, written on Approve just before the
// job document itself is deleted.
//
// Why this exists: Approve uploads the PDF to job-pdfs/<jobId>.pdf and then
// deletes the job from Firestore. jobId is a Date.now()+random string, so
// without this record NOTHING says which vehicle, customer, date or odometer
// reading that PDF belongs to — the archive becomes unsearchable the moment
// the job is cleared. This is the index that makes "attach customer A's last
// service to today's card" possible later; it is deliberately being written
// from today onwards even though nothing reads it yet, because history that
// wasn't captured at the time cannot be reconstructed afterwards.
//
// Keyed by jobId (not auto-id) so retrying a failed Approve overwrites the
// same row instead of leaving a duplicate behind.
function saveJobHistory(record) {
  return firebase
    .firestore()
    .collection("history")
    .doc(record.jobId)
    .set(record);
}

// Pulls the plain header fields worth indexing off a card's header state.
// Registration is the lookup key in practice — it is the one field that
// identifies the car regardless of who booked it or how the name was typed.
function buildHistoryRecord(jobId, template, header, pdfUrl, userEmail) {
  header = header || {};
  return {
    jobId: jobId,
    template: template || "",
    registration: (header.registration || "").trim().toUpperCase(),
    customer: header.customer || "",
    make: header.make || "",
    model: header.model || "",
    date: header.date || "",
    kilometers: header.kilometers || "",
    pdfPath: "job-pdfs/" + jobId + ".pdf",
    pdfUrl: pdfUrl || "",
    approvedBy: userEmail || "",
    approvedAt: new Date().toISOString()
  };
}
