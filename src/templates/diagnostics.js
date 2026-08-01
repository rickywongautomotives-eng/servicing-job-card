// Diagnostics template — not built yet. Placeholder so it's selectable from
// the template picker and the overall structure is in place; needs the
// user's input on what this template should actually contain.

function DiagnosticsCard({ onChangeTemplate }) {
  return html`
    <div class="app">
      <header class="topbar no-print">
        <h1 class="app-title">Diagnostics</h1>
        <div class="topbar-actions">
          <button type="button" class="btn btn-secondary" onClick=${onChangeTemplate}>← Templates</button>
        </div>
      </header>
      <main class="pages">
        <section class="page">
          <div class="template-placeholder">
            <p>The Diagnostics template hasn't been built yet.</p>
            <p>Let me know what sections/fields you want on it and I'll build it out.</p>
          </div>
        </section>
      </main>
    </div>
  `;
}
