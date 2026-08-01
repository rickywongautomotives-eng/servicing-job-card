// Main application: state, layout (page 1 + page 2), and PDF export.

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
function RichText({ value, onChange, exportMode, className, placeholder, multiline, disabled }) {
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

  React.useEffect(() => {
    if (!elRef.current) return;
    if (value !== lastReportedRef.current) {
      elRef.current.innerHTML = value || "";
      lastReportedRef.current = value;
    }
  }, [value]);

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
        onInput=${report}
        onKeyDown=${handleKeyDown}
        onMouseUp=${updateToolbar}
        onKeyUp=${updateToolbar}
        onTouchEnd=${updateToolbar}
      ></div>
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

  const page1Ref = React.useRef(null);
  const page2Ref = React.useRef(null);
  const photoPageRefs = React.useRef([]);
  const photoInputRef = React.useRef(null);

  // Role + card code drive live sync: opening the card normally is the
  // technician's editable copy; opening the same code with ?role=office is
  // the office's editable "watch" copy — same app, same permissions model,
  // just flagged so office edits render red/bold and tech-only controls
  // (physical checks/measurements) are disabled for that session.
  const role = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("role") === "office" ? "office" : "tech";
  }, []);
  const isOffice = role === "office";
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
  const page2Locked = kilometersMissing || logbookMissing;

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

  function buildSaveableState() {
    return {
      header, headerBy, oilSpec, oilSpecBy, fluids, preService,
      officeNotes, officeNotesBy, aboveCar, underCar, underCarBy,
      wheels, tyrePressure, tyreSize,
      notes2Left, notes2LeftBy, notes2Right, notes2RightBy,
      photos, cardCode,
    };
  }

  function persistJob(status) {
    const id = jobId || generateJobId();
    if (!jobId) setJobId(id);
    const job = {
      id,
      template: "general-service",
      status,
      label: buildJobLabel(header),
      savedAt: Date.now(),
      state: buildSaveableState(),
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

  function markComplete() {
    setJobStatus("completed");
    try {
      persistJob("completed");
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
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const photoPageCount = Math.ceil(photos.length / PHOTOS_PER_PAGE);
      const pages = [page1Ref.current, page2Ref.current, ...photoPageRefs.current.slice(0, photoPageCount)];
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const pageWidth = 210;
        const imgHeight = (canvas.height * pageWidth) / canvas.width;
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, imgHeight);
      }
      pdf.save(buildFilename());
      return true;
    } catch (err) {
      console.error(err);
      setExportError("Export failed: " + (err && err.message ? err.message : err));
      return false;
    } finally {
      setExportMode(false);
      setExporting(false);
    }
  }

  // Approve = the office reviewing a tech's "completed" card. Exports the
  // PDF and clears it from both the local and cloud saved-jobs list.
  async function approveJob() {
    const ok = await exportPDF();
    if (!ok) return;
    if (jobId) {
      deleteJob(jobId);
      syncDeleteJob(jobId).catch((err) => console.error("Cloud sync failed", err));
    }
    onChangeTemplate();
  }

  function copyOfficeLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("card", cardCode);
    url.searchParams.set("role", "office");
    navigator.clipboard.writeText(url.toString());
  }

  return html`
    <div class="app">
      <header class="topbar no-print">
        <h1 class="app-title">Servicing Job Card</h1>
        <div class="topbar-actions">
          <span class=${"role-badge" + (isOffice ? " role-badge-office" : "")}>
            ${isOffice ? "Office view" : "Technician"}
          </span>
          <span class="card-code">Card: ${cardCode}</span>
          ${!isOffice &&
          html`
            <button type="button" class="btn btn-secondary" onClick=${copyOfficeLink}>
              Copy office link
            </button>
          `}
          ${exportError && html`<span class="export-error">${exportError}</span>`}
          <button type="button" class="btn btn-secondary" onClick=${changeTemplate}>
            ← Templates
          </button>
          <button type="button" class="btn btn-secondary" onClick=${resetAll}>
            New card / Clear all
          </button>
          <button type="button" class="btn btn-secondary" onClick=${saveProgress}>
            Save Progress
          </button>
          ${jobStatus === "completed"
            ? html`
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
        </div>
      </header>

      <main class="pages">
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
              disabled=${isOffice}
            />
            <${SimpleCheckRow}
              label=${ENGINE_LIGHT_ITEM.label}
              status=${preService[ENGINE_LIGHT_ITEM.key].status}
              onChange=${(v) => updatePreServiceSimple(ENGINE_LIGHT_ITEM.key, v)}
              disabled=${isOffice}
            />
          </div>

          <div class="section-title">Fluids & Filters</div>
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

          <div class="section-title">Pre-Service Checks</div>
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
                    toggleDisabled=${isOffice}
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
                toggleDisabled=${isOffice}
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
                    toggleDisabled=${isOffice}
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
                toggleDisabled=${isOffice}
              />
            </div>
          </div>

          <div class="section-title">Notes (office use only)</div>
          <div class="notes-lined-wrap">
            <div class="notes-lines">
              ${NOTES_LINE_INDEXES.map((i) => html`<div class="notes-line" key=${i}></div>`)}
            </div>
            <${RichText}
              className=${"notes-box ruled-fill" + (officeNotesBy === "office" ? " office-written" : "")}
              value=${officeNotes}
              onChange=${updateOfficeNotes}
              multiline=${true}
              exportMode=${exportMode}
            />
          </div>
        </section>

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
            <div class="col">
              <div class="section-title">Above Car <span class="hint">(fill before car goes up)</span></div>
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
                    toggleDisabled=${isOffice}
                    exportMode=${exportMode}
                  />
                `
              )}
            </div>
            <div class="col">
              <div class="section-title">Wheel Measurements</div>
              <${WheelGrid}
                wheels=${wheels}
                tyrePressure=${tyrePressure}
                tyreSize=${tyreSize}
                onChange=${updateWheel}
                onPressureChange=${updateTyrePressure}
                onSizeChange=${updateTyreSize}
                disabled=${page2Locked || isOffice}
                exportMode=${exportMode}
              />
            </div>
          </div>

          <div class="section-title">Under Car <span class="hint">(fill before car goes down)</span></div>
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

          <div class="section-title">Notes</div>
          <div class="book-wrap">
            <div class="book-page">
              <div class="notes-lines">
                ${FILL_LINE_INDEXES.map((i) => html`<div class="notes-line" key=${i}></div>`)}
              </div>
              <${RichText}
                className=${"notes-box book-notes ruled-fill" + (notes2LeftBy === "office" ? " office-written" : "")}
                value=${notes2Left}
                onChange=${updateNotes2Left}
                multiline=${true}
                disabled=${page2Locked}
                exportMode=${exportMode}
              />
            </div>
            <div class="book-page">
              <div class="notes-lines">
                ${FILL_LINE_INDEXES.map((i) => html`<div class="notes-line" key=${i}></div>`)}
              </div>
              <${RichText}
                className=${"notes-box book-notes ruled-fill" + (notes2RightBy === "office" ? " office-written" : "")}
                value=${notes2Right}
                onChange=${updateNotes2Right}
                multiline=${true}
                disabled=${page2Locked}
                exportMode=${exportMode}
              />
            </div>
          </div>
        </section>

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
                        <img class="photo-img" src=${photo.dataUrl} alt="Job photo" />
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
