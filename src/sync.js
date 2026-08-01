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

// Offline persistence: queues writes locally (IndexedDB) when the tablet
// has no connection and replays them automatically once it's back online.
// synchronizeTabs lets multiple tabs on the same device share one cache.
firebase
  .firestore()
  .enablePersistence({ synchronizeTabs: true })
  .catch(function (err) {
    console.error("Firestore offline persistence unavailable:", err);
  });

function jobsCollection() {
  return firebase.firestore().collection("jobs");
}

// Deep-clones a job's state and blanks out photo image data before it goes
// to Firestore — handles both General Service's flat `photos` array and
// PPI's per-view `diagrams.<key>.photos` arrays. `id`/`syncedLocally` are
// kept so the UI can tell "this photo exists, just not on this device"
// apart from "no photo was ever taken here".
function stripPhotosForSync(state) {
  var copy = JSON.parse(JSON.stringify(state || {}));
  if (Array.isArray(copy.photos)) {
    copy.photos = copy.photos.map(function (p) {
      return { id: p.id, dataUrl: null, syncedLocally: true };
    });
  }
  if (copy.diagrams) {
    Object.keys(copy.diagrams).forEach(function (key) {
      var view = copy.diagrams[key];
      if (view && Array.isArray(view.photos)) {
        view.photos = view.photos.map(function (p) {
          return { id: p.id, dataUrl: null, syncedLocally: true };
        });
      }
    });
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
