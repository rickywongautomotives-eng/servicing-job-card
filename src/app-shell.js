// Top-level template picker + routing. Each template is its own
// self-contained component (GeneralServiceCard, PrePurchaseInspectionCard,
// DiagnosticsCard) — this just decides which one is showing, and (via
// storage.js) tracks saved in-progress/completed job cards so a tech can
// pause one job and pick up another, then come back to it later.

var TEMPLATES = [
  {
    id: "general-service",
    name: "General Service",
    icon: "🔧",
    description: "Routine servicing checklist — fluids, pre-service checks, above/under car, wheel measurements.",
  },
  {
    id: "pre-purchase-inspection",
    name: "Pre-Purchase Inspection",
    icon: "🔍",
    description: "Condition check for a car being considered for purchase, with a damage diagram.",
  },
  {
    id: "diagnostics",
    name: "Diagnostics",
    icon: "🩺",
    description: "Fault-finding and diagnosis writeup.",
  },
];

var TEMPLATE_COMPONENTS = {
  "general-service": GeneralServiceCard,
  "pre-purchase-inspection": PrePurchaseInspectionCard,
  diagnostics: DiagnosticsCard,
};

function formatSavedAt(ts) {
  const d = new Date(ts);
  const datePart = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return datePart + ", " + timePart;
}

var SAVED_JOB_STATUS_CLASS = {
  completed: "saved-job-status-complete",
  prefilled: "saved-job-status-prefilled",
};

function SavedJobRow({ job, onResume, onDiscard }) {
  return html`
    <div class="saved-job-row">
      <button type="button" class="saved-job-main" onClick=${() => onResume(job)}>
        <span class=${"saved-job-status " + (SAVED_JOB_STATUS_CLASS[job.status] || "saved-job-status-progress")}></span>
        <span class="saved-job-info">
          <span class="saved-job-label">${job.label}</span>
          <span class="saved-job-meta">${TEMPLATE_LABELS[job.template] || job.template} · ${formatSavedAt(job.savedAt)}</span>
        </span>
      </button>
      <button type="button" class="saved-job-discard" onClick=${() => onDiscard(job.id)} aria-label="Discard job card">
        ✕
      </button>
    </div>
  `;
}

function TemplatePicker({ onSelect, onResume, user, onSignOut }) {
  // Cloud is the source of truth once signed in — falls back to whatever's
  // saved on this device if the cloud can't be reached (still fully usable
  // offline; syncSaveJob's writes just queue and catch up automatically).
  const [jobs, setJobs] = React.useState(loadSavedJobs);
  const [syncError, setSyncError] = React.useState("");

  React.useEffect(() => {
    const unsubscribe = subscribeToJobs(
      (cloudJobs) => {
        setSyncError("");
        setJobs(cloudJobs);
      },
      (err) => {
        console.error(err);
        setSyncError("Can't reach the cloud right now — showing what's saved on this device.");
        setJobs(loadSavedJobs());
      }
    );
    return unsubscribe;
  }, []);

  function discardJob(id) {
    const ok = window.confirm("Discard this saved job card? This can't be undone.");
    if (!ok) return;
    deleteJob(id);
    syncDeleteJob(id).catch((err) => console.error(err));
  }

  const prefilled = jobs.filter((j) => j.status === "prefilled").sort((a, b) => b.savedAt - a.savedAt);
  const inProgress = jobs.filter((j) => j.status !== "completed" && j.status !== "prefilled").sort((a, b) => b.savedAt - a.savedAt);
  const completed = jobs.filter((j) => j.status === "completed").sort((a, b) => b.savedAt - a.savedAt);

  return html`
    <div class="template-picker">
      <div class="picker-account-bar">
        <span class="picker-account-email">${user.email}</span>
        <button type="button" class="picker-signout-btn" onClick=${onSignOut}>Sign out</button>
      </div>
      <h1 class="template-picker-title">Servicing Job Card</h1>
      ${syncError && html`<p class="picker-sync-error">${syncError}</p>`}
      <p class="template-picker-subtitle">Choose a template to start</p>
      <div class="template-grid">
        ${TEMPLATES.map(
          (t) => html`
            <button type="button" class="template-card" onClick=${() => onSelect(t.id)} key=${t.id}>
              <span class="template-icon">${t.icon}</span>
              <span class="template-name">${t.name}</span>
              <span class="template-desc">${t.description}</span>
            </button>
          `
        )}
      </div>

      ${(prefilled.length > 0 || inProgress.length > 0 || completed.length > 0) &&
      html`
        <div class="saved-jobs">
          ${prefilled.length > 0 &&
          html`
            <div class="saved-jobs-section">
              <div class="saved-jobs-title">Pre-filled Job Cards <span class="hint">(from tomorrow's bookings — click Start Job to begin)</span></div>
              ${prefilled.map((job) => html`<${SavedJobRow} key=${job.id} job=${job} onResume=${onResume} onDiscard=${discardJob} />`)}
            </div>
          `}
          ${inProgress.length > 0 &&
          html`
            <div class="saved-jobs-section">
              <div class="saved-jobs-title">In Progress</div>
              ${inProgress.map((job) => html`<${SavedJobRow} key=${job.id} job=${job} onResume=${onResume} onDiscard=${discardJob} />`)}
            </div>
          `}
          ${completed.length > 0 &&
          html`
            <div class="saved-jobs-section">
              <div class="saved-jobs-title">Completed <span class="hint">(awaiting your approval)</span></div>
              ${completed.map((job) => html`<${SavedJobRow} key=${job.id} job=${job} onResume=${onResume} onDiscard=${discardJob} />`)}
            </div>
          `}
        </div>
      `}
    </div>
  `;
}

// Everything that was App() before login existed — only ever mounted once
// a user is signed in, so it's safe to assume `user` is real here.
function AuthedApp({ user, onSignOut }) {
  // null = showing the picker. Otherwise the active editing session: which
  // template, and (if resuming) which saved job and its data.
  const [session, setSession] = React.useState(null);

  function startNew(templateId) {
    setSession({ templateId, jobId: null, initialStatus: null, initialState: null });
  }

  function resumeJob(job) {
    setSession({ templateId: job.template, jobId: job.id, initialStatus: job.status, initialState: job.state });
  }

  if (!session) {
    return html`<${TemplatePicker} onSelect=${startNew} onResume=${resumeJob} user=${user} onSignOut=${onSignOut} />`;
  }

  const TemplateComponent = TEMPLATE_COMPONENTS[session.templateId];
  return html`
    <${TemplateComponent}
      onChangeTemplate=${() => setSession(null)}
      jobId=${session.jobId}
      initialStatus=${session.initialStatus}
      initialState=${session.initialState}
      user=${user}
    />
  `;
}

// Gates the whole app behind Google Sign-In. Split out from AuthedApp (not
// just an early-return inside one component) because AuthedApp's own hooks
// can't be called conditionally — React requires the same hooks in the same
// order on every render, so "render the sign-in screen before any of
// AuthedApp's hooks run" has to be a genuinely different component, not an
// early return partway through one.
function App() {
  const [authUser, setAuthUser] = React.useState(undefined); // undefined = still checking, null = signed out
  const [authError, setAuthError] = React.useState("");
  const [signingIn, setSigningIn] = React.useState(false);

  React.useEffect(() => {
    const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
      setAuthUser(user);
    });
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    // Only matters for the redirect path (installed PWA, see isStandalone()
    // below) — picks up the result after signInWithRedirect sends the
    // browser back here. Harmless no-op for the popup path.
    firebase
      .auth()
      .getRedirectResult()
      .catch((err) => {
        setAuthError(err && err.message ? err.message : String(err));
      })
      .finally(() => setSigningIn(false));
  }, []);

  function isStandalone() {
    return (
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  // Popup-based sign-in has shown real crashes on Android Chrome (a
  // "database is closing" IndexedDB error), reproduced both installed and
  // in a plain browser tab — likely Android suspending the backgrounded
  // main tab while the popup is open, killing its open DB connections
  // mid-handshake. Route every mobile browser to redirect instead, not
  // just installed/standalone ones.
  function isMobile() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  }

  function signIn() {
    setAuthError("");
    setSigningIn(true);
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase
      .auth()
      .setPersistence(firebase.auth.Auth.Persistence.LOCAL)
      .then(function () {
        if (isStandalone() || isMobile()) {
          firebase.auth().signInWithRedirect(provider);
          return;
        }
        // Regular desktop browser tab: signInWithRedirect relies on a
        // cross-origin storage bridge to the *.firebaseapp.com authDomain
        // to restore the session after bouncing back, and current
        // Chrome's third-party storage blocking silently breaks that
        // bridge (auth quietly fails with no error, user just lands back
        // on the sign-in screen). Popup keeps the whole exchange in a
        // window whose top-level origin is the authDomain, sidestepping
        // that storage partitioning issue. Confirmed via testing:
        // redirect silently failed, popup worked, in this context.
        return firebase
          .auth()
          .signInWithPopup(provider)
          .catch((err) => {
            if (err && err.code === "auth/popup-blocked") {
              setAuthError("Your browser blocked the sign-in popup. Please allow popups for this site and try again.");
            } else if (err && err.code !== "auth/cancelled-popup-request" && err.code !== "auth/popup-closed-by-user") {
              setAuthError(err && err.message ? err.message : String(err));
            }
          })
          .finally(() => setSigningIn(false));
      });
  }

  function signOut() {
    firebase.auth().signOut();
  }

  if (authUser === undefined) {
    return html`<div class="auth-loading">Loading…</div>`;
  }

  if (!authUser) {
    return html`
      <div class="auth-gate">
        <div class="auth-card">
          <h1 class="auth-title">AMS Job Card</h1>
          <p class="auth-subtitle">Sign in to continue</p>
          ${authError && html`<p class="auth-error">${authError}</p>`}
          <button type="button" class="btn btn-primary auth-signin-btn" onClick=${signIn} disabled=${signingIn}>
            ${signingIn ? "Signing in…" : "Sign in with Google"}
          </button>
        </div>
      </div>
    `;
  }

  return html`<${AuthedApp} user=${authUser} onSignOut=${signOut} />`;
}
