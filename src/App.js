// Main application: state, layout (page 1 + page 2), and PDF export.

// Shared by every template that exports photos. html2canvas gives up on any
// image it can't resolve within its imageTimeout and just leaves a blank
// space — which is why photos would sometimes vanish from the exported PDF
// while looking fine on screen. Forcing each one through the browser's image
// cache first means html2canvas's own load resolves immediately.
// Always resolves (never rejects): a photo that genuinely can't decode
// shouldn't take the whole export down with it.
function preloadPhotoUrls(urls) {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise((resolve) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve;
          img.src = url;
        })
    )
  );
}

// How long to wait after the last edit before pushing it to the cloud.
// Short enough that the other side sees changes almost immediately, long
// enough that a burst of typing is one write rather than thirty.
var LIVE_SYNC_DEBOUNCE_MS = 700;

// Shared by both templates: keeps one open job card in sync with whoever
// else has it open, in both directions.
//
// Reads: a listener on this job's document. Incoming changes are merged in
// field by field (see mergeRemoteChanges in sync.js), never applied as a
// wholesale overwrite, and any field this device has edited but not yet
// pushed is left alone so an in-flight local edit can't be yanked away.
//
// Writes: after LIVE_SYNC_DEBOUNCE_MS of quiet, only the field paths that
// actually differ from what the server last told us get written.
//
// `buildState` and `applyRemoteState` are read through refs so the
// subscription doesn't tear down and rebuild on every render.
function useLiveJobSync({ jobId, active, userEmail, buildState, applyRemoteState, persistLocal }) {
  const remoteRef = React.useRef(null); // last state the server confirmed
  const dirtyRef = React.useRef({}); // local edits not yet pushed
  const timerRef = React.useRef(null);
  const [liveError, setLiveError] = React.useState("");
  const [lastRemoteEditAt, setLastRemoteEditAt] = React.useState(0);

  const buildStateRef = React.useRef(buildState);
  buildStateRef.current = buildState;
  const applyRef = React.useRef(applyRemoteState);
  applyRef.current = applyRemoteState;
  const userEmailRef = React.useRef(userEmail);
  userEmailRef.current = userEmail;
  const persistLocalRef = React.useRef(persistLocal);
  persistLocalRef.current = persistLocal;

  const flush = React.useCallback(() => {
    if (!jobId || !remoteRef.current) return;
    const current = stripPhotosForSync(buildStateRef.current());
    const changed = collectChangedPaths(remoteRef.current, current, "state");
    if (!Object.keys(changed).length) return;
    // Save to this device FIRST and independently of the network. Autosave
    // makes the card look like it's being saved continuously, so losing a
    // tablet's connection mid-job must not mean losing the work — the local
    // copy is what makes that promise true.
    if (persistLocalRef.current) {
      try {
        persistLocalRef.current();
      } catch (err) {
        console.error("Local autosave failed", err);
      }
    }
    // Assume the write lands; the listener corrects us if it doesn't.
    remoteRef.current = current;
    dirtyRef.current = {};
    changed.updatedBy = userEmailRef.current || "";
    syncPatchJob(jobId, changed).catch((err) => {
      console.error("Live sync write failed", err);
      setLiveError("Not syncing — changes are saved on this device only.");
    });
  }, [jobId]);

  React.useEffect(() => {
    if (!jobId || !active) return undefined;
    const unsubscribe = subscribeToJob(
      jobId,
      (data) => {
        // Every snapshot is processed, including ones Firestore flags as
        // having pending local writes. That flag means "this snapshot
        // contains some unacknowledged local write" — NOT "this is only my
        // own echo" — so skipping those silently dropped the other side's
        // edits whenever they landed while this device had an edit in
        // flight. Safety comes from the diff instead: our own echo produces
        // no changes against remoteRef, and genuinely concurrent edits are
        // protected field-by-field by dirtyRef.
        const incoming = data.state || {};
        const previous = remoteRef.current;
        if (!previous) {
          // First snapshot: adopt the cloud copy wholesale. The card may
          // have been opened from a stale localStorage copy (the picker
          // seeds from local storage before its cloud listener answers), and
          // merely baselining here would make those stale values look like
          // fresh local edits — which then get pushed over newer data the
          // other side had already saved. Nothing has been typed yet at this
          // point, so there is no local work to protect.
          remoteRef.current = incoming;
          applyRef.current(mergeRemoteChanges(buildStateRef.current(), {}, incoming, null));
          return;
        }
        const merged = mergeRemoteChanges(
          buildStateRef.current(),
          previous,
          incoming,
          dirtyRef.current
        );
        remoteRef.current = incoming;
        setLiveError("");
        applyRef.current(merged);
        setLastRemoteEditAt(Date.now());
      },
      (err) => {
        console.error("Live sync listener failed", err);
        setLiveError("Not syncing — changes are saved on this device only.");
      }
    );
    return unsubscribe;
  }, [jobId, active]);

  // Runs after every render (no dep array on purpose): recomputing the diff
  // against the server copy is what identifies "locally dirty" fields, and
  // that has to stay current with whatever was just typed.
  React.useEffect(() => {
    if (!jobId || !active || !remoteRef.current) return undefined;
    const current = stripPhotosForSync(buildStateRef.current());
    dirtyRef.current = collectChangedPaths(remoteRef.current, current, "state");
    if (!Object.keys(dirtyRef.current).length) return undefined;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, LIVE_SYNC_DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  });

  // Don't strand the last few keystrokes if the card is closed mid-edit.
  React.useEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      if (jobId && active) flush();
    };
  }, [jobId, active, flush]);

  return { liveError, lastRemoteEditAt };
}

// Shared by every template that captures photos: downscales to
// PHOTO_MAX_DIMENSION on the longest side and re-encodes as JPEG so exported
// PDFs stay a reasonable size.
function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > PHOTO_MAX_DIMENSION || height > PHOTO_MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * PHOTO_MAX_DIMENSION) / width);
            width = PHOTO_MAX_DIMENSION;
          } else {
            width = Math.round((width * PHOTO_MAX_DIMENSION) / height);
            height = PHOTO_MAX_DIMENSION;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Lets a tech bold/underline/colour part of what they've written to flag it
// as important (e.g. "brake pads near minimum" in red). Backs onto a plain
// contentEditable div rather than an <input>/<textarea> — those can't hold
// inline formatting at all. Deliberately NOT used for numeric/validated
// fields (wheel measurements, tyre size, costs) or fields with a native
// input type (date/email/tel) — rich text would break their validation or
// lose the device's native picker/keyboard for those.
//
// The div is intentionally "uncontrolled" from React's point of view (no
// children/dangerouslySetInnerHTML passed on re-render) so typing doesn't
// fight the DOM and reset the cursor. `value` is only pushed into the DOM
// on mount and when it changes from something OTHER than this element's own
// last reported edit (e.g. resuming a saved job, or Clear All) — ordinary
// typing never touches innerHTML from the React side.
function RichText({ value, onChange, exportMode, className, placeholder, multiline, disabled, limitToBox }) {
  const elRef = React.useRef(null);
  const lastReportedRef = React.useRef(value);
  // Kept current on every render so the stable ref callback below can read
  // it without needing `value` in its own closure (see attachRef).
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // A ref CALLBACK (not a mount-only effect) so this re-hydrates every time
  // the contentEditable div is (re)created — not just on first mount. It
  // gets recreated whenever exportMode toggles (this component swaps to a
  // plain div and back), and an effect with an empty dependency array only
  // ever fires once for the component's whole lifetime, so it would miss
  // every subsequent remount and leave the field blank after an export.
  //
  // MUST be wrapped in useCallback with an empty dep array so its identity
  // stays stable across re-renders. Without this, a fresh function is
  // created every render, and since React treats a changed ref identity as
  // "this ref detached, a new one attached" it re-invokes the callback on
  // EVERY render — including every single keystroke, since typing updates
  // state and re-renders the parent. That callback resets el.innerHTML,
  // which resets the cursor to position 0, so the next character always
  // gets typed at the very start of the field instead of where you're
  // actually typing — e.g. typing "Hello" comes out "olleH" (confirmed by
  // testing: this was a real, severe bug shipped in the first version).
  const attachRef = React.useCallback((el) => {
    elRef.current = el;
    if (el) {
      el.innerHTML = valueRef.current || "";
      lastReportedRef.current = valueRef.current;
    }
  }, []);

  const [toolbarPos, setToolbarPos] = React.useState(null);
  const toolbarRef = React.useRef(null);
  // Text already sitting past the last ruled line (e.g. notes auto-filled
  // from a long booking, written before this limit existed). It can't be
  // silently hidden — that's exactly the problem this is fixing — so the
  // field flags it instead.
  const [overflowing, setOverflowing] = React.useState(false);

  // Must be called AFTER the DOM has been given the current value. As its own
  // effect keyed on `value` it ran before applyValueToDom's effect and so
  // measured the previous contents, which flagged boxes that actually fit.
  const measureOverflow = React.useCallback(() => {
    const el = elRef.current;
    if (!limitToBox || !el) return;
    if (el.scrollHeight <= el.clientHeight + 1) {
      setOverflowing(false);
      return;
    }
    // Overflowing on raw height — but these boxes are deliberately pre-filled
    // with blank lines so every ruled line can be clicked into, and the page 2
    // notes carry 40 of them in a box that shows about nine. Counting those
    // put a permanent "text hidden below" warning on boxes that were empty.
    // Only trailing blank lines are discounted; anything with real text past
    // the last rule still warns.
    const trimmed = el.innerHTML.replace(/(?:\s|&nbsp;|<br\s*\/?>)+$/i, "");
    if (trimmed === el.innerHTML) {
      setOverflowing(true);
      return;
    }
    const probe = el.cloneNode(false);
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;right:auto;bottom:auto;height:auto;max-height:none;overflow:visible;width:" +
      el.offsetWidth +
      "px;";
    probe.innerHTML = trimmed;
    el.parentNode.appendChild(probe);
    const needed = probe.scrollHeight;
    probe.remove();
    setOverflowing(needed > el.clientHeight + 1);
  }, [limitToBox]);

  // Live sync means `value` can now change because the OTHER person edited
  // this field. Rewriting innerHTML while this field has focus would drop
  // the caret back to position 0 mid-sentence, so hold the incoming value
  // and apply it once focus leaves.
  const pendingRemoteRef = React.useRef(null);

  const applyValueToDom = React.useCallback((next) => {
    if (!elRef.current) return;
    if (next === lastReportedRef.current) return;
    if (document.activeElement === elRef.current) {
      pendingRemoteRef.current = next;
      return;
    }
    elRef.current.innerHTML = next || "";
    lastReportedRef.current = next;
    pendingRemoteRef.current = null;
  }, []);

  React.useEffect(() => {
    applyValueToDom(value);
    measureOverflow();
  }, [value, applyValueToDom, measureOverflow]);

  function handleBlur() {
    if (pendingRemoteRef.current !== null) applyValueToDom(pendingRemoteRef.current);
  }

  // Primary hide mechanism: tapping/clicking anywhere outside this field AND
  // outside the toolbar itself closes it. Listens on pointerdown (fires
  // before blur/click) rather than relying on the blur event alone, which
  // is timing-sensitive with the toolbar's own mousedown-preventDefault.
  React.useEffect(() => {
    if (!toolbarPos) return;
    function handlePointerDown(e) {
      const inField = elRef.current && elRef.current.contains(e.target);
      const inToolbar = toolbarRef.current && toolbarRef.current.contains(e.target);
      if (!inField && !inToolbar) setToolbarPos(null);
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [toolbarPos]);

  function report() {
    if (!elRef.current) return;
    const html = elRef.current.innerHTML;
    lastReportedRef.current = html;
    onChange(html);
  }

  function updateToolbar() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setToolbarPos(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!elRef.current || !elRef.current.contains(range.commonAncestorContainer)) {
      setToolbarPos(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setToolbarPos(null);
      return;
    }
    setToolbarPos({ top: rect.top - 42, left: rect.left + rect.width / 2 });
  }

  function applyFormat(cmd, arg) {
    elRef.current.focus();
    document.execCommand(cmd, false, arg);
    report();
  }

  function handleKeyDown(e) {
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      elRef.current.blur();
    }
  }

  // --- Scrolling a ruled notes box (limitToBox) ---
  //
  // These boxes used to refuse any edit that ran past the last ruled line.
  // They scroll instead now, so a long note stays readable on screen — but
  // the box is still a fixed size on an A4 sheet, so whatever is scrolled out
  // of view is NOT in the exported PDF. That's what the .rich-text-overflow
  // badge is for; it is the only thing standing between a long note and text
  // that quietly never prints.
  //
  // The ruled lines are a separate backdrop element behind the text, so it
  // has to be scrolled in lockstep or the writing drifts off the lines. The
  // backdrop draws far more lines than fit (RULE_DRAW_INDEXES) precisely so
  // there are lines to reveal.
  const linesBackdropRef = React.useRef(null);

  function syncRuledLines() {
    const el = elRef.current;
    if (!el) return;
    if (!linesBackdropRef.current) {
      // The backdrop is a sibling of this component's wrapper, so walk up
      // until an ancestor turns one up.
      let node = el.parentElement;
      while (node && !linesBackdropRef.current) {
        linesBackdropRef.current = node.querySelector(":scope > .notes-lines");
        node = node.parentElement;
      }
    }
    if (linesBackdropRef.current) linesBackdropRef.current.scrollTop = el.scrollTop;
  }

  function handleInput() {
    if (limitToBox) {
      measureOverflow();
      syncRuledLines();
    }
    report();
  }

  if (exportMode) {
    return html`
      <div
        class=${(className || "") + " export-text" + (multiline ? " export-text-block" : "")}
        dangerouslySetInnerHTML=${{ __html: value || "" }}
      ></div>
    `;
  }

  return html`
    <div class="rich-text-wrap">
      <div
        ref=${attachRef}
        class=${(className || "") + " rich-text" + (multiline ? " rich-text-multiline" : " rich-text-inline")}
        contentEditable=${!disabled}
        data-placeholder=${placeholder || ""}
        onInput=${handleInput}
        onScroll=${limitToBox ? syncRuledLines : undefined}
        onBlur=${handleBlur}
        onKeyDown=${handleKeyDown}
        onMouseUp=${updateToolbar}
        onKeyUp=${updateToolbar}
        onTouchEnd=${updateToolbar}
      ></div>
      ${limitToBox &&
      overflowing &&
      html`
        <span class="rich-text-overflow no-print" title="There is more text below — scroll the box to read it. It will NOT appear in the exported PDF, which only prints what fits the ruled lines. Shorten the note if it all has to print.">
          ⚠ more below — won't print
        </span>
      `}
      ${toolbarPos &&
      html`
        <div
          ref=${toolbarRef}
          class="rich-toolbar no-print"
          style=${{ top: toolbarPos.top + "px", left: toolbarPos.left + "px" }}
        >
          <button type="button" class="rt-btn" onMouseDown=${(e) => e.preventDefault()} onClick=${() => applyFormat("bold")}>
            <b>B</b>
          </button>
          <button type="button" class="rt-btn" onMouseDown=${(e) => e.preventDefault()} onClick=${() => applyFormat("underline")}>
            <u>U</u>
          </button>
          <button
            type="button"
            class="rt-swatch rt-swatch-red"
            onMouseDown=${(e) => e.preventDefault()}
            onClick=${() => applyFormat("foreColor", "#c0271d")}
            aria-label="Red"
          ></button>
          <button
            type="button"
            class="rt-swatch rt-swatch-orange"
            onMouseDown=${(e) => e.preventDefault()}
            onClick=${() => applyFormat("foreColor", "#c2760c")}
            aria-label="Orange"
          ></button>
          <button
            type="button"
            class="rt-swatch rt-swatch-green"
            onMouseDown=${(e) => e.preventDefault()}
            onClick=${() => applyFormat("foreColor", "#1a7f37")}
            aria-label="Green"
          ></button>
          <button type="button" class="rt-btn rt-clear" onMouseDown=${(e) => e.preventDefault()} onClick=${() => applyFormat("removeFormat")}>
            Clear
          </button>
        </div>
      `}
    </div>
  `;
}

function HeaderField({ field, value, by, onChange, exportMode }) {
  const wide = WIDE_HEADER_FIELD_KEYS.indexOf(field.key) !== -1;
  const officeClass = by === "office" ? " office-written" : "";
  return html`
    <label class=${"hfield" + (wide ? " hfield-wide" : "")}>
      <span class="hfield-label">${field.label}:</span>
      ${exportMode
        ? html`<div class=${"hfield-input export-text" + officeClass}>${value}</div>`
        : html`
            <input
              class=${"hfield-input" + officeClass}
              type=${field.type}
              value=${value}
              onChange=${(e) => onChange(field.key, e.target.value)}
              autoComplete="off"
            />
          `}
    </label>
  `;
}

function FluidRow({ row, entry, onToggle, onValue, exportMode }) {
  const checkedClass = entry.checkedBy === "office" ? " office-written" : "";
  const valueClass = entry.valueBy === "office" ? " office-written" : "";
  return html`
    <div class="fluid-row">
      <input
        type="checkbox"
        class=${"fluid-check" + checkedClass}
        checked=${entry.checked}
        onChange=${(e) => onToggle(row.key, e.target.checked)}
        aria-label=${row.label + " needs doing"}
      />
      <span class="fluid-label">${row.label}</span>
      <${RichText}
        className=${"fluid-value" + valueClass}
        value=${entry.value}
        onChange=${(html) => onValue(row.key, html)}
        placeholder="spec / value"
        exportMode=${exportMode}
      />
    </div>
  `;
}

function FreeTextRow({ item, value, by, onChange, disabled, exportMode }) {
  const officeClass = by === "office" ? " office-written" : "";
  return html`
    <div class="freetext-row">
      <span class="freetext-label">${item.label}</span>
      <${RichText}
        className=${"freetext-value" + officeClass}
        value=${value}
        onChange=${(html) => onChange(item.key, html)}
        disabled=${disabled}
        exportMode=${exportMode}
      />
    </div>
  `;
}

// Wheel measurement fields (tread/brake pad/brake disc/tyre pressure) —
// digits only, capped at maxDigits (a decimal point doesn't count, so with
// the default cap of 2, "5.5" is fine but "12.5" or "123" isn't). Brake
// disc uses a higher cap (3) to allow up to "99.9". type="number" can't be
// capped with maxlength and always shows spinner arrows, so these are plain
// text inputs with their own validation.
function isValidWheelValue(value, maxDigits) {
  if (!/^\d*\.?\d*$/.test(value)) return false;
  return (value.match(/\d/g) || []).length <= maxDigits;
}

// Tyre size auto-formats as digits are typed: 3 digits, "/", 2 digits, "R",
// 2 digits (e.g. 225/45R17) — width/aspect ratio/rim diameter — then stops
// accepting more. Reformats from the raw digits every time, so pasting a
// full size or typing it digit-by-digit both land on the same result.
function formatTyreSize(rawValue) {
  const digits = rawValue.replace(/\D/g, "").slice(0, 7);
  let out = digits.slice(0, 3);
  if (digits.length > 3) out += "/" + digits.slice(3, 5);
  if (digits.length > 5) out += "R" + digits.slice(5, 7);
  return out;
}

function WheelGrid({
  wheels,
  tyrePressure,
  tyreSize,
  onChange,
  onPressureChange,
  onSizeChange,
  disabled,
  exportMode,
}) {
  function numberCell(value, onValueChange, extraClass, maxDigits) {
    return exportMode
      ? html`<div class=${"wheel-input" + (extraClass ? " " + extraClass : "") + " export-text"}>${value}</div>`
      : html`
          <input
            type="text"
            inputMode="decimal"
            class=${"wheel-input" + (extraClass ? " " + extraClass : "")}
            value=${value}
            onChange=${(e) => {
              if (isValidWheelValue(e.target.value, maxDigits || 2)) onValueChange(e.target.value);
            }}
            disabled=${disabled}
          />
        `;
  }

  function sizeCell(value, onValueChange) {
    return exportMode
      ? html`<div class="tyre-size-input export-text">${value}</div>`
      : html`
          <input
            type="text"
            inputMode="numeric"
            class="tyre-size-input"
            value=${value}
            placeholder="e.g. 225/45R17"
            onChange=${(e) => onValueChange(formatTyreSize(e.target.value))}
            disabled=${disabled}
          />
        `;
  }

  function treadCells(wheelKey) {
    return TREAD_SUBFIELDS.map(
      (sf) => html`
        <td key=${sf.key}>
          ${numberCell(
            wheels[wheelKey].tread[sf.key],
            (v) => onChange(wheelKey, "tread", sf.key, v),
            "wheel-input-tread"
          )}
        </td>
      `
    );
  }

  return html`
    <div class="wheel-grid-wrap">
      <table class="wheel-grid wheel-grid-compact">
        <colgroup>
          <col class="wheel-col-label" />
          <col /><col /><col />
          <col /><col /><col />
        </colgroup>
        <thead>
          <tr>
            <th></th>
            <th colSpan="3">Left</th>
            <th colSpan="3">Right</th>
          </tr>
        </thead>
        <tbody>
          ${WHEEL_AXLE_ROWS.map(
            (row) => html`
              <tr key=${row.key}>
                <th class="wheel-metric-label">${row.label}</th>
                ${treadCells(row.left)}
                ${treadCells(row.right)}
              </tr>
            `
          )}
        </tbody>
      </table>
      <p class="wheel-hint">Tread: Outer / Middle / Inner (mm)</p>

      <div class="wheel-measure-card">
        <div class="wheel-side-block">
          <div class="wheel-extra-label">Tyre Pressure (PSI)</div>
          <div class="wheel-extra-row">
            ${AXLES.map(
              (axle) => html`
                <label class="wheel-extra-field" key=${axle.key}>
                  <span>${axle.label}</span>
                  ${numberCell(tyrePressure[axle.key], (v) => onPressureChange(axle.key, v))}
                </label>
              `
            )}
          </div>
        </div>
        <div class="wheel-side-block">
          <div class="wheel-extra-label">Tyre Size</div>
          <div class="tyre-size-row">
            ${AXLES.map(
              (axle) => html`
                <label class="tyre-size-field" key=${axle.key}>
                  <span>${axle.label}</span>
                  ${sizeCell(tyreSize[axle.key], (v) => onSizeChange(axle.key, v))}
                </label>
              `
            )}
          </div>
        </div>
        <div class="wheel-side-block">
          <div class="wheel-extra-label">Brake Pad (mm)</div>
          <div class="wheel-pad-row">
            ${WHEELS.map(
              (w) => html`
                <label class="wheel-pad-field" key=${w.key}>
                  <span>${w.shortLabel}</span>
                  ${numberCell(wheels[w.key].pad.value, (v) => onChange(w.key, "pad", "value", v))}
                </label>
              `
            )}
          </div>
        </div>
        <div class="wheel-side-block">
          <div class="wheel-extra-label">Brake Disc (mm)</div>
          <div class="wheel-pad-row">
            ${WHEELS.map(
              (w) => html`
                <label class="wheel-pad-field" key=${w.key}>
                  <span>${w.shortLabel}</span>
                  ${numberCell(
                    wheels[w.key].disc.value,
                    (v) => onChange(w.key, "disc", "value", v),
                    "wheel-input-disc",
                    3
                  )}
                </label>
              `
            )}
          </div>
        </div>
      </div>
    </div>
  `;
}

function StatusToggle({ value, onChange, options, disabled }) {
  return html`
    <div class="status-toggle">
      ${options.map(
        (opt) => html`
          <button
            type="button"
            key=${opt.key}
            class=${"status-btn status-" +
            opt.key +
            (value === opt.key ? " active" : "")}
            onClick=${() => onChange(value === opt.key ? "" : opt.key)}
            aria-label=${opt.title}
            disabled=${disabled}
          >
            ${opt.label}
          </button>
        `
      )}
    </div>
  `;
}

function LightCheckRow({ item, entry, onStatus, onNote, exportMode, options, notePlaceholder, toggleDisabled }) {
  const noteClass = entry.noteBy === "office" ? " office-written" : "";
  return html`
    <div class="light-row">
      <span class="light-label">${item.label}</span>
      <${StatusToggle}
        value=${entry.status}
        onChange=${(v) => onStatus(item.key, v)}
        options=${options || STATUS_OPTIONS_PASS_FAIL}
        disabled=${toggleDisabled}
      />
      ${onNote &&
      html`
        <${RichText}
          className=${"light-note" + noteClass}
          value=${entry.note}
          onChange=${(html) => onNote(item.key, html)}
          placeholder=${notePlaceholder || "bulb type / note"}
          exportMode=${exportMode}
        />
      `}
    </div>
  `;
}

function SimpleCheckRow({ label, status, onChange, options, disabled }) {
  return html`
    <div class="simple-check-row">
      <span class="simple-check-label">${label}</span>
      <${StatusToggle}
        value=${status}
        onChange=${onChange}
        options=${options || STATUS_OPTIONS_PASS_FAIL}
        disabled=${disabled}
      />
    </div>
  `;
}

function ConditionCheckRow({ item, entry, onStatus, onNote, disabled, toggleDisabled, exportMode }) {
  const noteClass = entry.noteBy === "office" ? " office-written" : "";
  return html`
    <div class="freetext-row condition-row">
      <span class="freetext-label">${item.label}</span>
      <${StatusToggle}
        value=${entry.status}
        onChange=${(v) => onStatus(item.key, v)}
        options=${STATUS_OPTIONS_CONDITION}
        disabled=${disabled || toggleDisabled}
      />
      <${RichText}
        className=${"condition-note" + noteClass}
        value=${entry.note}
        onChange=${(html) => onNote(item.key, html)}
        disabled=${disabled}
        exportMode=${exportMode}
      />
    </div>
  `;
}

// A section heading with the control that switches its section off. Shared,
// so every template gets the same affordance in the same place.
//
// The button is hidden in exportMode rather than marked .no-print:
// html2canvas ignores .no-print entirely, so anything that must stay off the
// printed card has to not be rendered at all.
function SectionTitle({ label, hint, sectionId, sections, onToggle, exportMode }) {
  const on = sections[sectionId];
  return html`
    <div class="section-title">
      <span>${label}${hint ? html` <span class="hint">${hint}</span>` : null}</span>
      ${!exportMode &&
      html`
        <button
          type="button"
          class="section-toggle"
          title=${on ? "Remove this section from the card" : "Add this section to the card"}
          aria-label=${(on ? "Remove " : "Add ") + label}
          onClick=${() => onToggle(sectionId)}
        >
          ${on ? "−" : "+"}
        </button>
      `}
    </div>
  `;
}

// The strip of "+ Section" buttons for everything currently switched off, so
// a removed section is always one tap from coming back. Never printed.
function SectionAdder({ sections, onToggle, hiddenWithContent, exportMode }) {
  if (exportMode) return null;
  const off = SECTION_DEFS.filter((d) => !sections[d.id]);
  if (!off.length) return null;
  return html`
    <div class="section-adder no-print">
      <span class="section-adder-label">Add:</span>
      ${off.map(
        (d) => html`
          <button type="button" class="section-add-btn" key=${d.id} onClick=${() => onToggle(d.id)}>
            + ${d.label}
            ${hiddenWithContent.includes(d.id) && html`<span class="section-add-flag">has entries</span>`}
          </button>
        `
      )}
    </div>
  `;
}

// The diagnostics record. Findings is the box that grows into whatever space
// the switched-off service sections freed up — on a towed-in car with no
// service work that is most of the page, which is the point: a diagnosis is
// mostly writing.
//
// Probable cause is deliberately its own box rather than the tail of
// Findings, because the quote is written off the cause. Watching a real job
// go through: the tech recorded "radiator cracked" and, separately, a brief
// summary of what could have caused it; the office quoted from the second.
// Strips the rich-text markup out of a notes field so it can go into a plain
// SMS. <br> becomes a newline first, or every line runs together.
function notesToPlainText(value) {
  if (!value) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function quoteTotals(items) {
  let sell = 0;
  let cost = 0;
  items.forEach((r) => {
    const s = parseFloat(String(r.sell).replace(/[^0-9.\-]/g, ""));
    const c = parseFloat(String(r.cost).replace(/[^0-9.\-]/g, ""));
    if (!isNaN(s)) sell += s;
    if (!isNaN(c)) cost += c;
  });
  return { sell, cost, margin: sell - cost };
}

function money(n) {
  return "$" + (Math.round(n * 100) / 100).toLocaleString();
}

// Builds the message that gets sent to the customer. Modelled on the real
// SMS for the 1UQ3XT Subaru: greeting, what was found in plain English, the
// itemised quote, then a sign-off. Only the parts that can be derived from
// the card are filled in — the explanation is whatever the technician wrote
// under Recommendation, not invented here.
//
// Cost and margin are deliberately absent: this text goes to the customer.
function buildQuoteMessage({ header, diagnostics, quote }) {
  const name = (header.customer || "").trim().split(/\s+/)[0];
  const vehicle = [header.make, header.model].filter(Boolean).join(" ").trim();
  const totals = quoteTotals(quote.items);
  const lines = [];

  lines.push("Hi" + (name ? " " + name : "") + ",");
  lines.push("");
  lines.push(
    "We've had a look at your " + (vehicle || "vehicle") + (header.registration ? " (" + header.registration + ")" : "") + "."
  );

  const cause = notesToPlainText(diagnostics.cause);
  if (cause) lines.push(cause);
  const rec = notesToPlainText(diagnostics.recommendation);
  if (rec) {
    lines.push("");
    lines.push(rec);
  }

  const rows = quote.items.filter((r) => (r.desc || "").trim() || (r.sell || "").trim());
  if (rows.length) {
    lines.push("");
    lines.push("Quote:");
    rows.forEach((r) => {
      const s = parseFloat(String(r.sell).replace(/[^0-9.\-]/g, ""));
      lines.push((r.desc || "").trim() + (isNaN(s) ? "" : ": " + money(s)));
    });
    lines.push("Total: " + money(totals.sell));
  }

  lines.push("");
  lines.push("Just reply here or give me a call if you have any questions.");
  lines.push("");
  lines.push("Regards");
  lines.push("Ricky");
  return lines.join("\n");
}

function QuoteSection({ quote, header, diagnostics, sections, onChange, onToggle, disabled, exportMode }) {
  const [copied, setCopied] = React.useState(false);
  const totals = quoteTotals(quote.items);

  function setRow(index, field, value) {
    onChange({
      items: quote.items.map((r, i) => (i === index ? Object.assign({}, r, { [field]: value }) : r)),
    });
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(buildQuoteMessage({ header, diagnostics, quote }));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  }

  return html`
    <${SectionTitle}
      label="Quote"
      sectionId="quote"
      sections=${sections}
      onToggle=${onToggle}
      exportMode=${exportMode}
    />
    <table class="quote-table">
      <thead>
        <tr>
          <th>Item</th>
          <th class="quote-num">Charge</th>
          <th class="quote-num quote-margin">Cost</th>
        </tr>
      </thead>
      <tbody>
        ${quote.items.map(
          (row, i) => html`
            <tr key=${i}>
              <td>
                <input type="text" value=${row.desc} disabled=${disabled}
                  onChange=${(e) => setRow(i, "desc", e.target.value)} />
              </td>
              <td class="quote-num">
                <input type="text" value=${row.sell} disabled=${disabled}
                  onChange=${(e) => setRow(i, "sell", e.target.value)} />
              </td>
              <td class="quote-num quote-margin">
                <input type="text" value=${row.cost} disabled=${disabled}
                  onChange=${(e) => setRow(i, "cost", e.target.value)} />
              </td>
            </tr>
          `
        )}
      </tbody>
      <tfoot>
        <tr>
          <td class="quote-total-label">Total</td>
          <td class="quote-num quote-total">${money(totals.sell)}</td>
          <td class="quote-num quote-margin quote-total">
            ${money(totals.cost)} <span class="quote-margin-figure">(${money(totals.margin)})</span>
          </td>
        </tr>
      </tfoot>
    </table>
    ${!exportMode &&
    html`
      <div class="quote-actions no-print">
        <button type="button" class="btn btn-secondary" onClick=${copyMessage}>
          ${copied ? "Copied ✓" : "Copy message for customer"}
        </button>
        <span class="quote-hint">
          Builds the SMS from Probable cause, Recommendation and the charges above. Cost and margin are left out.
        </span>
      </div>
    `}
  `;
}

function DiagnosticsSection({ data, sections, onChange, onToggle, disabled, exportMode }) {
  function setRow(listKey, index, field, value) {
    const rows = data[listKey].map((r, i) => (i === index ? Object.assign({}, r, { [field]: value }) : r));
    onChange(listKey, rows);
  }

  return html`
    <${SectionTitle}
      label="Diagnostics"
      sectionId="diagnostics"
      sections=${sections}
      onToggle=${onToggle}
      exportMode=${exportMode}
    />
    <div class="diag-block">
      <div class="diag-findings">
        <div class="diag-label">Findings / what was checked</div>
        <div class="notes-lined-wrap diag-findings-wrap">
          <div class="notes-lines">
            ${RULE_DRAW_INDEXES.map((i) => html`<div class="notes-line" key=${i}></div>`)}
          </div>
          <${RichText}
            className="notes-box ruled-fill"
            value=${data.findings}
            onChange=${(v) => onChange("findings", v)}
            multiline=${true}
            disabled=${disabled}
            exportMode=${exportMode}
          />
        </div>
      </div>

      <div class="diag-side">
        <div class="diag-sub">
          <div class="diag-label">Probable cause</div>
          <div class="notes-lined-wrap diag-short-wrap">
            <div class="notes-lines">
              ${RULE_DRAW_INDEXES.map((i) => html`<div class="notes-line" key=${i}></div>`)}
            </div>
            <${RichText}
              className="notes-box ruled-fill"
              value=${data.cause}
              onChange=${(v) => onChange("cause", v)}
              multiline=${true}
              disabled=${disabled}
              exportMode=${exportMode}
            />
          </div>
        </div>

        <div class="diag-sub">
          <div class="diag-label">Recommendation</div>
          <div class="notes-lined-wrap diag-short-wrap">
            <div class="notes-lines">
              ${RULE_DRAW_INDEXES.map((i) => html`<div class="notes-line" key=${i}></div>`)}
            </div>
            <${RichText}
              className="notes-box ruled-fill"
              value=${data.recommendation}
              onChange=${(v) => onChange("recommendation", v)}
              multiline=${true}
              disabled=${disabled}
              exportMode=${exportMode}
            />
          </div>
        </div>

        <div class="diag-sub">
          <div class="diag-label">Diagnostic time</div>
          <table class="diag-time">
            <thead>
              <tr><th>Date</th><th>Hours</th><th>What was done</th></tr>
            </thead>
            <tbody>
              ${data.timeLog.map(
                (row, i) => html`
                  <tr key=${i}>
                    <td>
                      <input type="text" value=${row.date} disabled=${disabled}
                        onChange=${(e) => setRow("timeLog", i, "date", e.target.value)} />
                    </td>
                    <td>
                      <input type="text" value=${row.hours} disabled=${disabled}
                        onChange=${(e) => setRow("timeLog", i, "hours", e.target.value)} />
                    </td>
                    <td>
                      <input type="text" value=${row.note} disabled=${disabled}
                        onChange=${(e) => setRow("timeLog", i, "note", e.target.value)} />
                    </td>
                  </tr>
                `
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    ${sections.faultCodes &&
    html`
      <${SectionTitle}
        label="Fault Codes"
        sectionId="faultCodes"
        sections=${sections}
        onToggle=${onToggle}
        exportMode=${exportMode}
      />
      <table class="diag-codes">
        <thead>
          <tr><th>Code</th><th>Description</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${data.faultCodes.map(
            (row, i) => html`
              <tr key=${i}>
                <td>
                  <input type="text" value=${row.code} placeholder="P0125" disabled=${disabled}
                    onChange=${(e) => setRow("faultCodes", i, "code", e.target.value)} />
                </td>
                <td>
                  <input type="text" value=${row.description} disabled=${disabled}
                    onChange=${(e) => setRow("faultCodes", i, "description", e.target.value)} />
                </td>
                <td>
                  <input type="text" value=${row.status} placeholder="active" disabled=${disabled}
                    onChange=${(e) => setRow("faultCodes", i, "status", e.target.value)} />
                </td>
              </tr>
            `
          )}
        </tbody>
      </table>
    `}
  `;
}

function GeneralServiceCard({ onChangeTemplate, jobId: initialJobId, initialStatus, initialState, user }) {
  const initial = buildInitialState();
  // When resuming a saved job, initialState carries every persisted field;
  // seed() falls back to the normal blank-card default for anything it
  // doesn't have (also covers older saves from before a new field existed).
  function seed(key, fallback) {
    return initialState && initialState[key] !== undefined ? initialState[key] : fallback;
  }
  const [header, setHeader] = React.useState(() => seed("header", initial.header));
  const [headerBy, setHeaderBy] = React.useState(() => seed("headerBy", initial.headerBy));
  const [oilSpec, setOilSpec] = React.useState(() => seed("oilSpec", initial.oilSpec));
  const [oilSpecBy, setOilSpecBy] = React.useState(() => seed("oilSpecBy", initial.oilSpecBy));
  const [fluids, setFluids] = React.useState(() => seed("fluids", initial.fluids));
  const [preService, setPreService] = React.useState(() => seed("preService", initial.preService));
  const [sections, setSections] = React.useState(() => seed("sections", initial.sections));
  const [diagnostics, setDiagnostics] = React.useState(() => seed("diagnostics", initial.diagnostics));
  const [quote, setQuote] = React.useState(() => seed("quote", initial.quote));
  const [officeNotes, setOfficeNotes] = React.useState(() => seed("officeNotes", NOTES_BLANK_VALUE));
  const [officeNotesBy, setOfficeNotesBy] = React.useState(() => seed("officeNotesBy", ""));
  const [aboveCar, setAboveCar] = React.useState(() => seed("aboveCar", initial.aboveCar));
  const [underCar, setUnderCar] = React.useState(() => seed("underCar", initial.underCar));
  const [underCarBy, setUnderCarBy] = React.useState(() => seed("underCarBy", initial.underCarBy));
  const [wheels, setWheels] = React.useState(() => seed("wheels", initial.wheels));
  const [tyrePressure, setTyrePressure] = React.useState(() => seed("tyrePressure", initial.tyrePressure));
  const [tyreSize, setTyreSize] = React.useState(() => seed("tyreSize", initial.tyreSize));
  // Page 2 Notes is laid out as two book-style pages side by side (instead
  // of one taller scrolling box) so there's more writing room without
  // needing to scroll.
  const [notes2Left, setNotes2Left] = React.useState(() => seed("notes2Left", FILL_BLANK_VALUE));
  const [notes2LeftBy, setNotes2LeftBy] = React.useState(() => seed("notes2LeftBy", ""));
  const [notes2Right, setNotes2Right] = React.useState(() => seed("notes2Right", FILL_BLANK_VALUE));
  const [notes2RightBy, setNotes2RightBy] = React.useState(() => seed("notes2RightBy", ""));
  const [photos, setPhotos] = React.useState(() => seed("photos", []));
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState("");
  const [exportMode, setExportMode] = React.useState(false);

  // Local save/resume (see storage.js) — no network sync yet, so this only
  // tracks the card on the device it was saved on.
  const [jobId, setJobId] = React.useState(initialJobId || null);
  const [jobStatus, setJobStatus] = React.useState(initialStatus || "in-progress");
  const [startedAt, setStartedAt] = React.useState(() => seed("startedAt", null));
  const [completedAt, setCompletedAt] = React.useState(() => seed("completedAt", null));
  // Completed cards are read-only for everyone except the owner, and even
  // the owner has to deliberately click Edit each time — this is a
  // per-session toggle, not something that gets saved, so a completed card
  // always opens locked by default.
  const isOwner = !!(user && user.email === OWNER_EMAIL);
  const [editUnlocked, setEditUnlocked] = React.useState(false);

  const page1Ref = React.useRef(null);
  const diagPageRef = React.useRef(null);
  const page2Ref = React.useRef(null);
  const photoPageRefs = React.useRef([]);
  const photoInputRef = React.useRef(null);

  // Role + card code drive live sync: opening the card normally is the
  // technician's editable copy; opening the same code with ?role=office is
  // the office's editable "watch" copy — same app, same permissions model,
  // just flagged so office edits render red/bold and tech-only controls
  // (physical checks/measurements) are disabled for that session.
  // Which side you are is decided by the account you're signed in with, not
  // by opening a special link — the owner is the office, anyone else is a
  // technician. You just open the card from the list like any other. The
  // ?role= override is kept only so both sides can be opened from a single
  // account for testing.
  const role = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const override = params.get("role");
    if (override === "office" || override === "tech") return override;
    return user && user.email === OWNER_EMAIL ? "office" : "tech";
  }, [user]);
  const isOffice = role === "office";

  // Declared here, AFTER isOffice — it reads it. Sitting with the other lock
  // state further up put it in the temporal dead zone and threw
  // "Cannot access 'isOffice' before initialization", which blanked every
  // General Service card.
  //
  // A not-yet-started card stays read-only for technicians: pressing Start
  // Job is what begins the job and stamps the start time, so letting them
  // type into it first would make that timestamp meaningless. The office is
  // exempt — correcting a booking before the tech picks it up is exactly
  // when it needs editing. Completed cards stay locked for everyone until
  // the owner deliberately presses Edit.
  const locked =
    (jobStatus === "prefilled" && !isOffice) ||
    (jobStatus === "completed" && !editUnlocked);

  const [cardCode, setCardCode] = React.useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("card") || seed("cardCode", generateCardCode());
  });

  React.useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("card", cardCode);
    window.history.replaceState(null, "", url);
  }, [cardCode]);

  const kilometersMissing = !header.kilometers || !header.kilometers.trim();
  const logbookMissing = !preService.logbook.status;
  // Page 2 stays gated behind "kilometres + logbook recorded first" for
  // technicians, since that's the point of the gate — those two get captured
  // on arrival before anything else. The office/owner is exempt: they need to
  // be able to correct any part of a card at any time, and kilometres is
  // never auto-filled, so the gate would otherwise be permanently shut on a
  // freshly pre-filled booking.
  const page2Locked = (kilometersMissing || logbookMissing) && !isOffice;

  // Page 2 exists to hold the physical inspection. Switch all three of its
  // groups off — a diagnosis on a towed-in car with no service work — and
  // there is nothing left to put on it, so the page isn't rendered at all
  // rather than printing a blank second sheet.
  const page2Used = sections.aboveCar || sections.wheels || sections.underCar;

  // Where the diagnostics section goes depends on what else is on the card,
  // because a page is one A4 sheet and cannot grow.
  //
  // Diagnosis-only job (service sections switched off): it sits on page 1 and
  // the findings box expands into the space they freed — measured at 320px of
  // ruled writing instead of the 248px a normal notes box gets.
  //
  // Service AND diagnosis on the same visit (routine here — a car booked for
  // a service that the customer also wants looked at, or the reverse): page 1
  // is already full, so diagnostics takes a sheet of its own. Measured:
  // forcing both onto page 1 gives 1486px against a 1123px budget.
  // Page 1 only has room for diagnostics or the quote once the two big
  // service blocks are switched off. Even then it still carries the header,
  // the oil bar, the logbook panel and the 248px notes box, so it fits ONE of
  // them, not both: diagnostics + quote + fault codes measured 1380px against
  // the 1123px budget. Whatever doesn't fit goes to a sheet of its own.
  const page1HasRoom = !sections.fluids && !sections.preService;
  const diagOnPage1 = sections.diagnostics && page1HasRoom;
  const quoteOnPage1 = sections.quote && page1HasRoom && !sections.diagnostics;
  const extrasPageUsed =
    (sections.diagnostics && !diagOnPage1) || (sections.quote && !quoteOnPage1);

  const updateHeader = (key, value) => {
    setHeader((prev) => ({ ...prev, [key]: value }));
    setHeaderBy((prev) => ({ ...prev, [key]: role }));
  };

  const updateOilSpec = (key, value) => {
    setOilSpec((prev) => ({ ...prev, [key]: value }));
    setOilSpecBy((prev) => ({ ...prev, [key]: role }));
  };

  const toggleFluid = (key, checked) =>
    setFluids((prev) => ({ ...prev, [key]: { ...prev[key], checked, checkedBy: role } }));

  const valueFluid = (key, value) =>
    setFluids((prev) => ({ ...prev, [key]: { ...prev[key], value, valueBy: role } }));

  const updateAboveCarStatus = (key, status) =>
    setAboveCar((prev) => ({ ...prev, [key]: { ...prev[key], status } }));

  const updateAboveCarNote = (key, note) =>
    setAboveCar((prev) => ({ ...prev, [key]: { ...prev[key], note, noteBy: role } }));

  const updateUnderCar = (key, value) => {
    setUnderCar((prev) => ({ ...prev, [key]: value }));
    setUnderCarBy((prev) => ({ ...prev, [key]: role }));
  };

  const updateWheel = (wheelKey, metricKey, subKey, value) =>
    setWheels((prev) => ({
      ...prev,
      [wheelKey]: {
        ...prev[wheelKey],
        [metricKey]: { ...prev[wheelKey][metricKey], [subKey]: value },
      },
    }));

  const updateTyrePressure = (axleKey, value) =>
    setTyrePressure((prev) => ({ ...prev, [axleKey]: value }));

  const updateTyreSize = (axleKey, value) =>
    setTyreSize((prev) => ({ ...prev, [axleKey]: value }));

  const updatePreServiceStatus = (side, key, status) =>
    setPreService((prev) => ({
      ...prev,
      [side]: { ...prev[side], [key]: { ...prev[side][key], status } },
    }));

  const updatePreServiceNote = (side, key, note) =>
    setPreService((prev) => ({
      ...prev,
      [side]: { ...prev[side], [key]: { ...prev[side][key], note, noteBy: role } },
    }));

  const updatePreServiceSimple = (key, status) =>
    setPreService((prev) => ({ ...prev, [key]: { ...prev[key], status } }));

  const updatePreServiceSimpleNote = (key, note) =>
    setPreService((prev) => ({ ...prev, [key]: { ...prev[key], note, noteBy: role } }));

  const updateOfficeNotes = (value) => {
    setOfficeNotes(value);
    setOfficeNotesBy(role);
  };

  const updateNotes2Left = (value) => {
    setNotes2Left(value);
    setNotes2LeftBy(role);
  };

  const updateNotes2Right = (value) => {
    setNotes2Right(value);
    setNotes2RightBy(role);
  };

  async function handlePhotoSelected(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const dataUrl = await resizeImageFile(file);
    setPhotos((prev) => [...prev, { id: Date.now() + "-" + Math.random().toString(36).slice(2), dataUrl }]);
  }

  const removePhoto = (id) =>
    setPhotos((prev) => prev.filter((p) => p.id !== id));

  function changeTemplate() {
    const ok = window.confirm(
      "Leave this job card? Any unsaved changes will be lost."
    );
    if (!ok) return;
    onChangeTemplate();
  }

  function resetAll() {
    const ok = window.confirm(
      "Start a new card? This clears every field and drawing on this job card."
    );
    if (!ok) return;
    const fresh = buildInitialState();
    setHeader(fresh.header);
    setHeaderBy(fresh.headerBy);
    setOilSpec(fresh.oilSpec);
    setOilSpecBy(fresh.oilSpecBy);
    setFluids(fresh.fluids);
    setPreService(fresh.preService);
    setOfficeNotes(NOTES_BLANK_VALUE);
    setOfficeNotesBy("");
    setAboveCar(fresh.aboveCar);
    setUnderCar(fresh.underCar);
    setUnderCarBy(fresh.underCarBy);
    setWheels(fresh.wheels);
    setTyrePressure(fresh.tyrePressure);
    setTyreSize(fresh.tyreSize);
    setNotes2Left(FILL_BLANK_VALUE);
    setNotes2LeftBy("");
    setNotes2Right(FILL_BLANK_VALUE);
    setNotes2RightBy("");
    setPhotos([]);
    setExportError("");
    setCardCode(generateCardCode());
    setJobId(null);
    setJobStatus("in-progress");
  }

  // Switching a section off HIDES it — it never deletes what is in it, so
  // turning it back on brings every tick and every line of text back exactly
  // as it was. That makes a mis-tap recoverable, but it also means content
  // can be sitting in a section that isn't on the card, so hiding something
  // with entries in it asks first, and anything still hidden is flagged
  // on screen by SectionAdder.
  function updateDiagnostics(key, value) {
    setDiagnostics((prev) => Object.assign({}, prev, { [key]: value }));
  }

  function updateQuote(patch) {
    setQuote((prev) => Object.assign({}, prev, patch));
  }

  function toggleSection(id) {
    const def = SECTION_DEFS.find((d) => d.id === id);
    const turningOff = sections[id];
    if (turningOff && def && def.hasContent(buildSaveableState())) {
      const ok = window.confirm(
        def.label +
          " has entries in it.\n\nRemoving it hides it from the card and from the exported PDF. " +
          "Nothing is deleted — adding it back restores everything.\n\nRemove it?"
      );
      if (!ok) return;
    }
    setSections((prev) => Object.assign({}, prev, { [id]: !prev[id] }));
  }

  // Sections that are switched off but still hold entries. Surfaced on screen
  // only — a hidden section's content never reaches the printed card, and
  // silently dropping work off the PDF is the one failure mode this whole
  // hide-don't-delete design has to stay honest about.
  const hiddenWithContent = React.useMemo(() => {
    const s = buildSaveableState();
    return SECTION_DEFS.filter((d) => !sections[d.id] && d.hasContent(s)).map((d) => d.id);
  }, [sections, fluids, preService, aboveCar, underCar, wheels, tyrePressure, tyreSize, diagnostics, quote]);

  function buildSaveableState() {
    return {
      header, headerBy, oilSpec, oilSpecBy, fluids, preService,
      sections, diagnostics, quote,
      officeNotes, officeNotesBy, aboveCar, underCar, underCarBy,
      wheels, tyrePressure, tyreSize,
      notes2Left, notes2LeftBy, notes2Right, notes2RightBy,
      photos, cardCode, startedAt, completedAt,
    };
  }

  function persistJob(status, stateOverrides) {
    const id = jobId || generateJobId();
    if (!jobId) setJobId(id);
    const job = {
      id,
      template: "general-service",
      status,
      label: buildJobLabel(header),
      savedAt: Date.now(),
      state: Object.assign(buildSaveableState(), stateOverrides || {}),
    };
    saveJob(job); // full data (incl. photos) stays on this device regardless
    syncSaveJob(job, user && user.email).catch((err) => {
      // Firestore's offline persistence already queues this and retries on
      // its own — a rejection here means something genuinely failed (e.g.
      // permission denied), not just "no signal right now".
      console.error("Cloud sync failed", err);
    });
    return job;
  }

  function saveProgress() {
    try {
      persistJob(jobStatus);
      onChangeTemplate();
    } catch (err) {
      console.error(err);
      setExportError("Save failed: " + (err && err.message ? err.message : err));
    }
  }

  // A pre-filled card is read-only until the tech deliberately starts it —
  // this is what actually stamps the start time and moves it into "In
  // Progress" on the picker. Stays on the card afterward (now unlocked)
  // rather than bouncing back to the picker, since the tech is right there
  // about to begin working on it.
  function startJob() {
    const startedAtTs = Date.now();
    setJobStatus("in-progress");
    setStartedAt(startedAtTs);
    try {
      persistJob("in-progress", { startedAt: startedAtTs });
    } catch (err) {
      console.error(err);
      setExportError("Save failed: " + (err && err.message ? err.message : err));
    }
  }

  // completedAt is stamped once and never overwritten by a later
  // re-completion after the owner reopens the card via Edit — "we can still
  // go with the original completed stamp time" was explicit.
  function markComplete() {
    const completedAtTs = completedAt || Date.now();
    setJobStatus("completed");
    setCompletedAt(completedAtTs);
    setEditUnlocked(false);
    try {
      persistJob("completed", { completedAt: completedAtTs });
      onChangeTemplate();
    } catch (err) {
      console.error(err);
      setExportError("Save failed: " + (err && err.message ? err.message : err));
    }
  }

  function buildFilename() {
    const parts = [header.customer, header.registration, header.date].filter(
      (v) => v && v.trim()
    );
    const raw = parts.length ? parts.join("_") : "job-card";
    return raw.replace(/[^a-zA-Z0-9_-]+/g, "_") + ".pdf";
  }

  async function exportPDF() {
    setExportError("");
    setExporting(true);
    setExportMode(true);
    try {
      // Let React re-render with plain-text stand-ins for every input/textarea
      // before capturing — html2canvas can't reliably paint live input values.
      await new Promise((resolve) => setTimeout(resolve, 50));
      await preloadPhotoUrls(photos.map((p) => p.dataUrl));
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const photoPageCount = Math.ceil(photos.length / PHOTOS_PER_PAGE);
      // Filtered because page 2 is not rendered at all when every one of its
      // sections is switched off — a diagnosis-only card is genuinely one
      // page, and html2canvas would throw on the null ref.
      const pages = [
        page1Ref.current,
        diagPageRef.current,
        page2Ref.current,
        ...photoPageRefs.current.slice(0, photoPageCount),
      ].filter(Boolean);
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          imageTimeout: 30000,
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const pageWidth = 210;
        const imgHeight = (canvas.height * pageWidth) / canvas.width;
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, imgHeight);
      }
      pdf.save(buildFilename());
      return pdf.output("blob");
    } catch (err) {
      console.error(err);
      setExportError("Export failed: " + (err && err.message ? err.message : err));
      return null;
    } finally {
      setExportMode(false);
      setExporting(false);
    }
  }

  // Approve = the office reviewing a tech's "completed" card. Exports the
  // PDF, backs it up to Cloud Storage, and only then clears it from the
  // local and cloud saved-jobs list — if the cloud backup fails, the job
  // stays put so Approve can be retried instead of silently losing it.
  async function approveJob() {
    const blob = await exportPDF();
    if (!blob) return;
    if (jobId) {
      setExporting(true);
      try {
        const pdfUrl = await uploadJobPdf(jobId, blob);
        // Written BEFORE the job is deleted — this is the only thing that
        // will still say which car and customer the archived PDF belongs to.
        await saveJobHistory(
          buildHistoryRecord(jobId, "general-service", header, pdfUrl, user && user.email)
        );
      } catch (err) {
        console.error(err);
        setExportError(
          "PDF exported, but the cloud backup failed: " + (err && err.message ? err.message : err) + ". Try Approve again once you're back online."
        );
        setExporting(false);
        return;
      }
      setExporting(false);
      deleteJob(jobId);
      syncDeleteJob(jobId).catch((err) => console.error("Cloud sync failed", err));
    }
    onChangeTemplate();
  }

  // Pushes whatever the other side just changed into this card's state.
  // Only fields that actually changed remotely reach here (the merge happens
  // in useLiveJobSync), so assigning each slice wholesale is safe.
  // photos/cardCode are deliberately skipped: photo image data never goes to
  // the cloud, and the card code is this card's identity, not content.
  const applyRemoteState = React.useCallback((s) => {
    if (s.header) setHeader(s.header);
    if (s.headerBy) setHeaderBy(s.headerBy);
    if (s.oilSpec) setOilSpec(s.oilSpec);
    if (s.oilSpecBy) setOilSpecBy(s.oilSpecBy);
    if (s.fluids) setFluids(s.fluids);
    if (s.preService) setPreService(s.preService);
    // Section switches sync like any other field, so the office turning the
    // diagnostics section on makes it appear on the tech's tablet.
    if (s.sections) setSections(s.sections);
    if (s.diagnostics) setDiagnostics(s.diagnostics);
    if (s.quote) setQuote(s.quote);
    if (s.officeNotes !== undefined) setOfficeNotes(s.officeNotes);
    if (s.officeNotesBy !== undefined) setOfficeNotesBy(s.officeNotesBy);
    if (s.aboveCar) setAboveCar(s.aboveCar);
    if (s.underCar) setUnderCar(s.underCar);
    if (s.underCarBy) setUnderCarBy(s.underCarBy);
    if (s.wheels) setWheels(s.wheels);
    if (s.tyrePressure) setTyrePressure(s.tyrePressure);
    if (s.tyreSize) setTyreSize(s.tyreSize);
    if (s.notes2Left !== undefined) setNotes2Left(s.notes2Left);
    if (s.notes2LeftBy !== undefined) setNotes2LeftBy(s.notes2LeftBy);
    if (s.notes2Right !== undefined) setNotes2Right(s.notes2Right);
    if (s.notes2RightBy !== undefined) setNotes2RightBy(s.notes2RightBy);
    if (s.startedAt !== undefined) setStartedAt(s.startedAt);
    if (s.completedAt !== undefined) setCompletedAt(s.completedAt);
  }, []);

  // Local half of autosave. Deliberately does NOT call syncSaveJob — that
  // writes the whole document and would undo the other side's concurrent
  // edits, which is exactly what the per-field patching exists to avoid.
  function autosaveLocally() {
    if (!jobId) return;
    saveJob({
      id: jobId,
      template: "general-service",
      status: jobStatus,
      label: buildJobLabel(header),
      savedAt: Date.now(),
      state: buildSaveableState(),
    });
  }

  const { liveError, lastRemoteEditAt } = useLiveJobSync({
    jobId,
    active: !!jobId,
    userEmail: user && user.email,
    buildState: buildSaveableState,
    applyRemoteState,
    persistLocal: autosaveLocally,
  });

  return html`
    <div class="app">
      <header class="topbar no-print">
        <h1 class="app-title">Servicing Job Card</h1>
        <div class="topbar-actions">
          <span class=${"role-badge" + (isOffice ? " role-badge-office" : "")}>
            ${isOffice ? "Office view" : "Technician"}
          </span>
          <span class="card-code">Card: ${cardCode}</span>
          ${jobId &&
          html`
            <span
              class=${"live-badge" + (liveError ? " live-badge-off" : "") +
                (!liveError && Date.now() - lastRemoteEditAt < 2500 ? " live-badge-active" : "")}
              title=${liveError || "Changes sync both ways while this card is open"}
            >
              <span class="live-dot"></span>${liveError ? "Offline" : "Live"}
            </span>
          `}
          ${liveError && html`<span class="export-error">${liveError}</span>`}
          ${exportError && html`<span class="export-error">${exportError}</span>`}
          <button type="button" class="btn btn-secondary" onClick=${changeTemplate}>
            ← Templates
          </button>
          ${jobStatus === "prefilled"
            ? html`
                ${isOffice &&
                html`
                  <button type="button" class="btn btn-secondary" onClick=${saveProgress}>
                    Save Progress
                  </button>
                `}
                <button type="button" class="btn btn-primary" onClick=${startJob}>
                  Start Job
                </button>
              `
            : html`
                ${jobStatus !== "completed" &&
                html`
                  <button type="button" class="btn btn-secondary" onClick=${resetAll}>
                    New card / Clear all
                  </button>
                `}
                ${(jobStatus !== "completed" || editUnlocked) &&
                html`
                  <button type="button" class="btn btn-secondary" onClick=${saveProgress}>
                    Save Progress
                  </button>
                `}
                ${jobStatus === "completed"
                  ? html`
                      ${isOwner && !editUnlocked &&
                      html`
                        <button type="button" class="btn btn-secondary" onClick=${() => setEditUnlocked(true)}>
                          Edit
                        </button>
                      `}
                      <button type="button" class="btn btn-primary" onClick=${approveJob} disabled=${exporting}>
                        ${exporting ? "Approving…" : "Approve"}
                      </button>
                    `
                  : html`
                      <button type="button" class="btn btn-secondary" onClick=${markComplete}>
                        Mark Complete
                      </button>
                    `}
                <button
                  type="button"
                  class="btn btn-primary"
                  onClick=${exportPDF}
                  disabled=${exporting}
                >
                  ${exporting ? "Exporting…" : "Export as PDF"}
                </button>
              `}
        </div>
      </header>

      <${SectionAdder}
        sections=${sections}
        onToggle=${toggleSection}
        hiddenWithContent=${hiddenWithContent}
        exportMode=${exportMode}
      />

      <main class=${"pages" + (locked ? " pages-locked" : "")}>
        <section class="page" id="page1" ref=${page1Ref}>
          <div class="page-label">Page 1</div>

          <div class="header-groups">
            ${HEADER_GROUPS.map(
              (group) => html`
                <div class="header-group" key=${group.title}>
                  <div class="header-group-title">${group.title}</div>
                  <div class="header-group-fields">
                    ${group.keys.map((key) => {
                      const f = HEADER_FIELDS.find((hf) => hf.key === key);
                      return html`
                        <${HeaderField}
                          key=${f.key}
                          field=${f}
                          value=${header[f.key]}
                          by=${headerBy[f.key]}
                          onChange=${updateHeader}
                          exportMode=${exportMode}
                        />
                      `;
                    })}
                  </div>
                </div>
              `
            )}
          </div>

          <div class="oil-spec-bar">
            ${OIL_SPEC_FIELDS.map(
              (f) => html`
                <div class="oil-spec-item" key=${f.key}>
                  <span class="oil-spec-label">${f.label}</span>
                  <${RichText}
                    className=${"oil-spec-input" + (oilSpecBy[f.key] === "office" ? " office-written" : "")}
                    value=${oilSpec[f.key]}
                    onChange=${(html) => updateOilSpec(f.key, html)}
                    exportMode=${exportMode}
                  />
                </div>
              `
            )}
          </div>

          <div class="engine-logbook-panel">
            <${SimpleCheckRow}
              label=${LOGBOOK_ITEM.label}
              status=${preService[LOGBOOK_ITEM.key].status}
              onChange=${(v) => updatePreServiceSimple(LOGBOOK_ITEM.key, v)}
              options=${STATUS_OPTIONS_LOGBOOK}
            />
            <${SimpleCheckRow}
              label=${ENGINE_LIGHT_ITEM.label}
              status=${preService[ENGINE_LIGHT_ITEM.key].status}
              onChange=${(v) => updatePreServiceSimple(ENGINE_LIGHT_ITEM.key, v)}
            />
            ${!exportMode &&
            html`
              <button
                type="button"
                class=${"diag-toggle" + (sections.diagnostics ? " is-on" : "")}
                onClick=${() => toggleSection("diagnostics")}
                title=${sections.diagnostics
                  ? "Remove the diagnostics section"
                  : "Add the diagnostics section to this card"}
              >
                ${sections.diagnostics ? "−" : "+"} Diagnostics
              </button>
            `}
          </div>

          ${sections.fluids &&
          html`
          <${SectionTitle}
            label="Fluids & Filters"
            sectionId="fluids"
            sections=${sections}
            onToggle=${toggleSection}
            exportMode=${exportMode}
          />
          <div class="fluids-grid">
            <div class="fluids-col">
              ${FLUID_ROWS_COL1.map(
                (row) => html`
                  <${FluidRow}
                    key=${row.key}
                    row=${row}
                    entry=${fluids[row.key]}
                    onToggle=${toggleFluid}
                    onValue=${valueFluid}
                    exportMode=${exportMode}
                  />
                `
              )}
            </div>
            <div class="fluids-col">
              ${FLUID_ROWS_COL2.map(
                (row) => html`
                  <${FluidRow}
                    key=${row.key}
                    row=${row}
                    entry=${fluids[row.key]}
                    onToggle=${toggleFluid}
                    onValue=${valueFluid}
                    exportMode=${exportMode}
                  />
                `
              )}
            </div>
          </div>
          `}

          ${sections.preService &&
          html`
          <${SectionTitle}
            label="Pre-Service Checks"
            sectionId="preService"
            sections=${sections}
            onToggle=${toggleSection}
            exportMode=${exportMode}
          />
          <div class="prelights-grid">
            <div class="prelights-col">
              <div class="prelights-heading">Front of Vehicle</div>
              ${PRE_SERVICE_FRONT_ITEMS.map(
                (item) => html`
                  <${LightCheckRow}
                    key=${item.key}
                    item=${item}
                    entry=${preService.front[item.key]}
                    onStatus=${(k, v) => updatePreServiceStatus("front", k, v)}
                    onNote=${(k, v) => updatePreServiceNote("front", k, v)}
                    exportMode=${exportMode}
                  />
                `
              )}
              <${LightCheckRow}
                item=${FRONT_WIPER_ITEM}
                entry=${preService[FRONT_WIPER_ITEM.key]}
                onStatus=${(k, v) => updatePreServiceSimple(k, v)}
                onNote=${(k, v) => updatePreServiceSimpleNote(k, v)}
                exportMode=${exportMode}
                options=${STATUS_OPTIONS_CONDITION}
                notePlaceholder="note"
              />
            </div>
            <div class="prelights-col">
              <div class="prelights-heading">Rear of Vehicle</div>
              ${PRE_SERVICE_REAR_ITEMS.map(
                (item) => html`
                  <${LightCheckRow}
                    key=${item.key}
                    item=${item}
                    entry=${preService.rear[item.key]}
                    onStatus=${(k, v) => updatePreServiceStatus("rear", k, v)}
                    onNote=${(k, v) => updatePreServiceNote("rear", k, v)}
                    exportMode=${exportMode}
                  />
                `
              )}
              <${LightCheckRow}
                item=${REAR_WIPER_ITEM}
                entry=${preService[REAR_WIPER_ITEM.key]}
                onStatus=${(k, v) => updatePreServiceSimple(k, v)}
                onNote=${(k, v) => updatePreServiceSimpleNote(k, v)}
                exportMode=${exportMode}
                options=${STATUS_OPTIONS_CONDITION}
                notePlaceholder="note"
              />
            </div>
          </div>
          `}

          ${diagOnPage1 &&
          html`<${DiagnosticsSection}
            data=${diagnostics}
            sections=${sections}
            onChange=${updateDiagnostics}
            onToggle=${toggleSection}
            disabled=${locked}
            exportMode=${exportMode}
          />`}
          ${quoteOnPage1 &&
          html`<${QuoteSection}
            quote=${quote}
            header=${header}
            diagnostics=${diagnostics}
            sections=${sections}
            onChange=${updateQuote}
            onToggle=${toggleSection}
            disabled=${locked}
            exportMode=${exportMode}
          />`}

          <div class="section-title">Notes (office use only)</div>
          <div class="notes-lined-wrap">
            <div class="notes-lines">
              ${RULE_DRAW_INDEXES.map((i) => html`<div class="notes-line" key=${i}></div>`)}
            </div>
            <${RichText}
              className=${"notes-box ruled-fill" + (officeNotesBy === "office" ? " office-written" : "")}
              limitToBox=${true}
              value=${officeNotes}
              onChange=${updateOfficeNotes}
              multiline=${true}
              exportMode=${exportMode}
            />
          </div>
        </section>

        ${extrasPageUsed &&
        html`
        <section class="page" id="pagediag" ref=${diagPageRef}>
          <div class="page-label">${sections.diagnostics && !diagOnPage1 ? "Diagnostics" : "Quote"}</div>
          ${sections.diagnostics &&
          !diagOnPage1 &&
          html`<${DiagnosticsSection}
            data=${diagnostics}
            sections=${sections}
            onChange=${updateDiagnostics}
            onToggle=${toggleSection}
            disabled=${locked}
            exportMode=${exportMode}
          />`}
          ${sections.quote &&
          !quoteOnPage1 &&
          html`<${QuoteSection}
            quote=${quote}
            header=${header}
            diagnostics=${diagnostics}
            sections=${sections}
            onChange=${updateQuote}
            onToggle=${toggleSection}
            disabled=${locked}
            exportMode=${exportMode}
          />`}
        </section>
        `}

        ${page2Used &&
        html`
        <section class="page" id="page2" ref=${page2Ref}>
          <div class="page-label">Page 2</div>

          ${page2Locked &&
          !exportMode &&
          html`
            <div class="lock-banner no-print">
              🔒 Fill in <strong>Kilometers</strong> and the <strong>Logbook</strong>
              check on Page 1 to unlock this page.
            </div>
          `}

          <div class="two-col">
            ${sections.aboveCar &&
            html`
            <div class="col">
              <${SectionTitle}
                label="Above Car"
                hint="(fill before car goes up)"
                sectionId="aboveCar"
                sections=${sections}
                onToggle=${toggleSection}
                exportMode=${exportMode}
              />
              <p class="condition-legend">
                <span class="status-btn status-good active"></span> Good
                <span class="status-btn status-attention active"></span> Needs attention
                <span class="status-btn status-due active"></span> Due / replace
                <span class="status-btn"></span> Blank = N/A
              </p>
              ${ABOVE_CAR_ITEMS.map(
                (item) => html`
                  <${ConditionCheckRow}
                    key=${item.key}
                    item=${item}
                    entry=${aboveCar[item.key]}
                    onStatus=${updateAboveCarStatus}
                    onNote=${updateAboveCarNote}
                    disabled=${page2Locked}
                    exportMode=${exportMode}
                  />
                `
              )}
            </div>
            `}
            ${sections.wheels &&
            html`
            <div class="col">
              <${SectionTitle}
                label="Wheel Measurements"
                sectionId="wheels"
                sections=${sections}
                onToggle=${toggleSection}
                exportMode=${exportMode}
              />
              <${WheelGrid}
                wheels=${wheels}
                tyrePressure=${tyrePressure}
                tyreSize=${tyreSize}
                onChange=${updateWheel}
                onPressureChange=${updateTyrePressure}
                onSizeChange=${updateTyreSize}
                disabled=${page2Locked}
                exportMode=${exportMode}
              />
            </div>
            `}
          </div>

          ${sections.underCar &&
          html`
          <${SectionTitle}
            label="Under Car"
            hint="(fill before car goes down)"
            sectionId="underCar"
            sections=${sections}
            onToggle=${toggleSection}
            exportMode=${exportMode}
          />
          <div class="freetext-full">
            ${UNDER_CAR_ITEMS.map(
              (item) => html`
                <${FreeTextRow}
                  key=${item.key}
                  item=${item}
                  value=${underCar[item.key]}
                  by=${underCarBy[item.key]}
                  onChange=${updateUnderCar}
                  disabled=${page2Locked}
                  exportMode=${exportMode}
                />
              `
            )}
          </div>
          `}

          <div class="section-title">Notes</div>
          <div class="book-wrap">
            <div class="book-page">
              <div class="notes-lines">
                ${RULE_DRAW_INDEXES.map((i) => html`<div class="notes-line" key=${i}></div>`)}
              </div>
              <${RichText}
                className=${"notes-box book-notes ruled-fill" + (notes2LeftBy === "office" ? " office-written" : "")}
                limitToBox=${true}
                value=${notes2Left}
                onChange=${updateNotes2Left}
                multiline=${true}
                disabled=${page2Locked}
                exportMode=${exportMode}
              />
            </div>
            <div class="book-page">
              <div class="notes-lines">
                ${RULE_DRAW_INDEXES.map((i) => html`<div class="notes-line" key=${i}></div>`)}
              </div>
              <${RichText}
                className=${"notes-box book-notes ruled-fill" + (notes2RightBy === "office" ? " office-written" : "")}
                limitToBox=${true}
                value=${notes2Right}
                onChange=${updateNotes2Right}
                multiline=${true}
                disabled=${page2Locked}
                exportMode=${exportMode}
              />
            </div>
          </div>
        </section>
        `}

        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref=${photoInputRef}
          style=${{ display: "none" }}
          onChange=${handlePhotoSelected}
        />
        ${(() => {
          // Reserve one extra slot for the "add photo" tile so it always has
          // room on the current page instead of appearing as a 7th row that
          // would spill past the printable page height.
          const pageCount = Math.max(1, Math.ceil((photos.length + 1) / PHOTOS_PER_PAGE));
          return Array.from({ length: pageCount }).map((_, pageIndex) => {
            const pagePhotos = photos.slice(
              pageIndex * PHOTOS_PER_PAGE,
              (pageIndex + 1) * PHOTOS_PER_PAGE
            );
            const isLastPage = pageIndex === pageCount - 1;
            return html`
              <section
                class="page"
                id=${"page3-" + pageIndex}
                key=${pageIndex}
                ref=${(el) => {
                  photoPageRefs.current[pageIndex] = el;
                }}
              >
                <div class="page-label">Page ${3 + pageIndex}</div>
                <div class="section-title">Photos</div>
                <div class="photo-grid">
                  ${pagePhotos.map(
                    (photo) => html`
                      <div class="photo-card" key=${photo.id}>
                        <div
                          class="photo-img"
                          role="img"
                          aria-label="Job photo"
                          style=${{ backgroundImage: 'url("' + photo.dataUrl + '")' }}
                        ></div>
                        ${!exportMode &&
                        html`
                          <button
                            type="button"
                            class="photo-remove"
                            onClick=${() => removePhoto(photo.id)}
                            aria-label="Remove photo"
                          >
                            ✕
                          </button>
                        `}
                      </div>
                    `
                  )}
                  ${isLastPage &&
                  !exportMode &&
                  html`
                    <button
                      type="button"
                      class="photo-add-tile"
                      onClick=${() => photoInputRef.current.click()}
                    >
                      <span class="photo-add-icon">📷</span>
                      <span>Add Photo</span>
                    </button>
                  `}
                </div>
              </section>
            `;
          });
        })()}
      </main>
    </div>
  `;
}
