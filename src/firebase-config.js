// Firebase project connection (see memory: cloud sync is being layered on
// top of the local save/resume system, phase 3 of the roadmap). Uses the
// vendored *compat* SDK, not the modern modular SDK — this app has no
// build step/bundler, and the compat build is the one designed to work
// from plain <script> tags, exposing a global `firebase` namespace the
// same way every other vendored library here does.
//
// initializeApp() itself is local/synchronous — it doesn't make any network
// calls on its own, so loading this doesn't change the app's offline-first
// behavior until something actually calls firebase.firestore()/auth()/etc.

var firebaseConfig = {
  apiKey: "AIzaSyD9ENLrXeZIqkIAAQzdb0kIb__pKFB1his",
  authDomain: "ams-service-job-card.firebaseapp.com",
  projectId: "ams-service-job-card",
  storageBucket: "ams-service-job-card.firebasestorage.app",
  messagingSenderId: "63806304522",
  appId: "1:63806304522:web:d7ebdec2e9062350944af3",
};

firebase.initializeApp(firebaseConfig);
