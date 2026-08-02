// Pre-Purchase Inspection template: header, Keys/Logbook/PPSR checks, five
// car-damage diagrams (each with its own notes + multi-photo gallery),
// reused Above Car / Under Car / Wheel Measurements sections from the
// General Service template, and a closing Evaluation section.

function roundRectPathOn(ctx, x, y, width, height, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

// All car outlines are drawn directly on the canvas (not <img src="*.svg">
// layers) — html2canvas rasterizes external SVG images unreliably, but it
// captures live canvas pixel content natively, so this renders identically
// on screen and in the exported PDF.

// Draws a smooth closed curve through a list of anchor points (a common
// "midpoint quadratic" technique) — much more organic than lineTo-only
// polygons, without needing hand-tuned bezier handles for every segment.
function smoothClosedPath(ctx, points) {
  const n = points.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(points[n - 1], points[0]);
  ctx.beginPath();
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const next = points[(i + 1) % n];
    const m = mid(points[i], next);
    ctx.quadraticCurveTo(points[i][0], points[i][1], m[0], m[1]);
  }
  ctx.closePath();
}

function drawCarBirdsEye(ctx, w, h) {
  const sx = w / 340;
  const sy = h / 640;

  ctx.save();
  ctx.scale(sx, sy);

  // One continuous tapered silhouette (nose -> front fender -> waist -> rear
  // fender -> tail) instead of a plain rounded rectangle, so it actually
  // reads as a car body from above rather than a capsule.
  smoothClosedPath(ctx, [
    [170, 15],
    [238, 32],
    [274, 140],
    [258, 320],
    [274, 500],
    [238, 608],
    [170, 625],
    [102, 608],
    [66, 500],
    [82, 320],
    [66, 140],
    [102, 32],
  ]);
  const bodyGrad = ctx.createLinearGradient(60, 0, 280, 0);
  bodyGrad.addColorStop(0, "#dbdfe5");
  bodyGrad.addColorStop(0.18, "#f6f7f9");
  bodyGrad.addColorStop(0.5, "#eef0f3");
  bodyGrad.addColorStop(0.82, "#f6f7f9");
  bodyGrad.addColorStop(1, "#dbdfe5");
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = "#7a808c";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Windshields, curved in from the hood/trunk line up to the roof edge
  ctx.fillStyle = "#dde3ea";
  ctx.strokeStyle = "#7a808c";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(90, 178);
  ctx.quadraticCurveTo(84, 208, 106, 230);
  ctx.lineTo(234, 230);
  ctx.quadraticCurveTo(256, 208, 250, 178);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(106, 410);
  ctx.quadraticCurveTo(84, 432, 90, 462);
  ctx.lineTo(250, 462);
  ctx.quadraticCurveTo(256, 432, 234, 410);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Roof / cabin
  roundRectPathOn(ctx, 100, 230, 140, 180, 22);
  const roofGrad = ctx.createLinearGradient(100, 0, 240, 0);
  roofGrad.addColorStop(0, "#eceef1");
  roofGrad.addColorStop(0.5, "#f9fafb");
  roofGrad.addColorStop(1, "#eceef1");
  ctx.fillStyle = roofGrad;
  ctx.fill();
  ctx.strokeStyle = "#7a808c";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Door seams following the body curve, plus a centerline for reference
  ctx.strokeStyle = "#b9bec7";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(66, 285);
  ctx.quadraticCurveTo(90, 292, 100, 292);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(274, 285);
  ctx.quadraticCurveTo(250, 292, 240, 292);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(66, 358);
  ctx.quadraticCurveTo(90, 350, 100, 350);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(274, 358);
  ctx.quadraticCurveTo(250, 350, 240, 350);
  ctx.stroke();
  ctx.setLineDash([4, 5]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(170, 230);
  ctx.lineTo(170, 410);
  ctx.stroke();
  ctx.setLineDash([]);

  // Wing mirrors, angled outward like the front/rear view's clusters
  ctx.fillStyle = "#dde3ea";
  ctx.strokeStyle = "#7a808c";
  ctx.lineWidth = 2;
  [1, -1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(170 + side * 100, 214);
    ctx.lineTo(170 + side * 122, 206);
    ctx.lineTo(170 + side * 120, 226);
    ctx.lineTo(170 + side * 100, 230);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  // Wheels at each fender bulge, dark tire with a faint tread highlight
  [140, 500].forEach((cy) => {
    [1, -1].forEach((side) => {
      const cx = 170 + side * 122;
      roundRectPathOn(ctx, cx - 17, cy - 45, 34, 90, 11);
      ctx.fillStyle = "#2c2f36";
      ctx.fill();
      ctx.strokeStyle = "#7a808c";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = "#565b63";
      ctx.lineWidth = 1.5;
      for (let t = -28; t <= 28; t += 14) {
        ctx.beginPath();
        ctx.moveTo(cx - 12, cy + t);
        ctx.lineTo(cx + 12, cy + t);
        ctx.stroke();
      }
    });
  });

  ctx.fillStyle = "#7a808c";
  ctx.font = "700 16px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FRONT", 170, 50);
  ctx.fillText("REAR", 170, 605);

  ctx.restore();
}

function drawCarFrontRear(ctx, w, h, isRear) {
  const sx = w / 460;
  const sy = h / 320;

  ctx.save();
  ctx.scale(sx, sy);

  // One continuous rounded silhouette (bumper -> fender -> hood -> roof)
  // instead of separate stacked boxes, so it reads as a single body panel.
  smoothClosedPath(ctx, [
    [95, 255],
    [365, 255],
    [402, 238],
    [407, 195],
    [383, 145],
    [330, 96],
    [285, 55],
    [175, 55],
    [130, 96],
    [77, 145],
    [53, 195],
    [58, 238],
  ]);
  const frBodyGrad = ctx.createLinearGradient(0, 55, 0, 255);
  frBodyGrad.addColorStop(0, "#f7f8f9");
  frBodyGrad.addColorStop(0.45, "#eef0f3");
  frBodyGrad.addColorStop(1, "#dde0e5");
  ctx.fillStyle = frBodyGrad;
  ctx.fill();
  ctx.strokeStyle = "#7a808c";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Windshield, nested under the roofline
  ctx.beginPath();
  ctx.moveTo(158, 145);
  ctx.lineTo(302, 145);
  ctx.lineTo(272, 68);
  ctx.lineTo(188, 68);
  ctx.closePath();
  ctx.fillStyle = "#dde3ea";
  ctx.fill();
  ctx.strokeStyle = "#7a808c";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Headlight / taillight clusters angled along the fender line
  ctx.fillStyle = isRear ? "#f6c9c5" : "#fbf3c9";
  ctx.strokeStyle = "#7a808c";
  ctx.lineWidth = 2;
  [1, -1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(230 + side * 122, 150);
    ctx.lineTo(230 + side * 172, 138);
    ctx.lineTo(230 + side * 168, 178);
    ctx.lineTo(230 + side * 118, 186);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // thin reflector accent line inside the cluster
    ctx.strokeStyle = isRear ? "#c0271d" : "#c2760c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(230 + side * 128, 158);
    ctx.lineTo(230 + side * 160, 150);
    ctx.stroke();
    ctx.strokeStyle = "#7a808c";
    ctx.lineWidth = 2;
  });

  // Grille (front) / numberplate + reflectors (rear)
  if (isRear) {
    roundRectPathOn(ctx, 178, 198, 104, 36, 6);
    ctx.fillStyle = "#f7f8f9";
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#c2760c";
    ctx.beginPath();
    ctx.arc(150, 232, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(310, 232, 7, 0, Math.PI * 2);
    ctx.fill();
  } else {
    roundRectPathOn(ctx, 178, 195, 104, 42, 8);
    ctx.fillStyle = "#c7ccd3";
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "#9aa0aa";
    ctx.lineWidth = 2;
    [204, 214, 224].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(186, y);
      ctx.lineTo(274, y);
      ctx.stroke();
    });
    ctx.strokeStyle = "#7a808c";
  }

  // Bumper seam
  ctx.strokeStyle = "#b9bec7";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(112, 232);
  ctx.lineTo(348, 232);
  ctx.stroke();

  // Wheels peeking below the bumper line
  ctx.fillStyle = "#3a3f47";
  roundRectPathOn(ctx, 68, 244, 58, 34, 12);
  ctx.fill();
  roundRectPathOn(ctx, 334, 244, 58, 34, 12);
  ctx.fill();
  ctx.fillStyle = "#7a808c";
  roundRectPathOn(ctx, 82, 250, 30, 20, 8);
  ctx.fill();
  roundRectPathOn(ctx, 348, 250, 30, 20, 8);
  ctx.fill();

  // Wing mirrors
  ctx.fillStyle = "#dde3ea";
  ctx.strokeStyle = "#7a808c";
  ctx.lineWidth = 2;
  [1, -1].forEach((side) => {
    ctx.beginPath();
    ctx.moveTo(230 + side * 148, 118);
    ctx.lineTo(230 + side * 168, 112);
    ctx.lineTo(230 + side * 164, 130);
    ctx.lineTo(230 + side * 146, 132);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
}

function drawCarSide(ctx, w, h, mirror) {
  const DW = 620;
  const DH = 300;
  const sx = w / DW;
  const sy = h / DH;
  const sillY = 232;
  const rearCx = 152;
  const frontCx = 494;
  const archR = 58;
  const wheelR = 46;

  ctx.save();
  ctx.scale(sx, sy);
  if (mirror) {
    ctx.translate(DW, 0);
    ctx.scale(-1, 1);
  }

  // Body silhouette, built as one continuous path with real wheel-arch
  // notches (drawn with ctx.arc, not just circles overlapping a flat sill)
  // so the wheels look properly seated instead of floating.
  ctx.beginPath();
  ctx.moveTo(60, 198);
  ctx.quadraticCurveTo(44, 212, 55, 232);
  ctx.lineTo(rearCx - archR, sillY);
  ctx.arc(rearCx, sillY, archR, Math.PI, 0, false);
  ctx.lineTo(frontCx - archR, sillY);
  ctx.arc(frontCx, sillY, archR, Math.PI, 0, false);
  ctx.lineTo(578, sillY);
  ctx.quadraticCurveTo(590, 210, 580, 186);
  ctx.lineTo(560, 150);
  ctx.quadraticCurveTo(522, 124, 462, 132);
  ctx.lineTo(366, 66);
  ctx.quadraticCurveTo(350, 55, 330, 55);
  ctx.lineTo(216, 53);
  ctx.quadraticCurveTo(196, 53, 179, 64);
  ctx.lineTo(140, 120);
  ctx.quadraticCurveTo(100, 130, 71, 151);
  ctx.quadraticCurveTo(59, 162, 60, 198);
  ctx.closePath();
  const sideBodyGrad = ctx.createLinearGradient(0, 53, 0, sillY);
  sideBodyGrad.addColorStop(0, "#f7f8f9");
  sideBodyGrad.addColorStop(0.5, "#eef0f3");
  sideBodyGrad.addColorStop(1, "#dde0e5");
  ctx.fillStyle = sideBodyGrad;
  ctx.fill();
  ctx.strokeStyle = "#7a808c";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Windows (front + rear, split by the B-pillar/door seam)
  ctx.fillStyle = "#dde3ea";
  ctx.strokeStyle = "#7a808c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(316, 136);
  ctx.lineTo(452, 136);
  ctx.lineTo(392, 74);
  ctx.lineTo(322, 74);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(168, 136);
  ctx.lineTo(308, 136);
  ctx.lineTo(308, 70);
  ctx.lineTo(202, 70);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Door seams
  ctx.strokeStyle = "#b9bec7";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(310, 136);
  ctx.lineTo(310, sillY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(232, 140);
  ctx.lineTo(232, sillY);
  ctx.stroke();

  // Handle marks
  ctx.strokeStyle = "#9aa0aa";
  ctx.lineWidth = 2;
  [270, 190].forEach((x) => {
    ctx.beginPath();
    ctx.moveTo(x - 14, 152);
    ctx.lineTo(x + 14, 152);
    ctx.stroke();
  });

  // Mirror
  ctx.fillStyle = "#7a808c";
  ctx.beginPath();
  ctx.moveTo(320, 126);
  ctx.lineTo(336, 114);
  ctx.lineTo(324, 108);
  ctx.closePath();
  ctx.fill();

  // Wheels — tire, rim, hub
  function wheel(cx, cy) {
    ctx.beginPath();
    ctx.arc(cx, cy, wheelR, 0, Math.PI * 2);
    ctx.fillStyle = "#2c2f36";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, wheelR * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = "#c7ccd3";
    ctx.fill();
    ctx.strokeStyle = "#7a808c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, wheelR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "#9aa0aa";
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * wheelR * 0.5, cy + Math.sin(a) * wheelR * 0.5);
      ctx.stroke();
    }
  }
  wheel(frontCx, sillY);
  wheel(rearCx, sillY);

  ctx.restore();

  // Labels drawn unflipped (mirror the x position manually) so text always
  // reads correctly regardless of which side is shown.
  ctx.save();
  ctx.scale(sx, sy);
  ctx.fillStyle = "#7a808c";
  ctx.font = "700 15px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("FRONT", mirror ? DW - frontCx : frontCx, sillY + 44);
  ctx.fillText("REAR", mirror ? DW - rearCx : rearCx, sillY + 44);
  ctx.restore();
}

var PPI_DIAGRAM_DRAWERS = {
  birdsEye: { draw: drawCarBirdsEye, canvasW: 340, canvasH: 640, wrapClass: "wrap-birdseye" },
  front: { draw: (ctx, w, h) => drawCarFrontRear(ctx, w, h, false), canvasW: 460, canvasH: 300, wrapClass: "wrap-frontrear" },
  rear: { draw: (ctx, w, h) => drawCarFrontRear(ctx, w, h, true), canvasW: 460, canvasH: 300, wrapClass: "wrap-frontrear" },
  left: { draw: (ctx, w, h) => drawCarSide(ctx, w, h, false), canvasW: 620, canvasH: 300, wrapClass: "wrap-side" },
  right: { draw: (ctx, w, h) => drawCarSide(ctx, w, h, true), canvasW: 620, canvasH: 300, wrapClass: "wrap-side" },
};

function CarDamageDiagram({ strokes, onStrokesChange, disabled, exportMode, drawBg, canvasW, canvasH, wrapClass }) {
  const canvasRef = React.useRef(null);
  const drawingRef = React.useRef(false);
  const currentStrokeRef = React.useRef([]);

  function getPoint(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function redraw(liveStroke) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBg(ctx, canvas.width, canvas.height);
    ctx.strokeStyle = "#c0271d";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    function drawStroke(stroke) {
      if (stroke.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * canvas.width, stroke[0].y * canvas.height);
      stroke.slice(1).forEach((p) => ctx.lineTo(p.x * canvas.width, p.y * canvas.height));
      ctx.stroke();
    }
    strokes.forEach(drawStroke);
    if (liveStroke && liveStroke.length) drawStroke(liveStroke);
  }

  React.useEffect(() => {
    redraw();
  }, [strokes]);

  function handlePointerDown(e) {
    if (disabled) return;
    e.preventDefault();
    e.target.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    currentStrokeRef.current = [getPoint(e)];
  }

  function handlePointerMove(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    currentStrokeRef.current.push(getPoint(e));
    redraw(currentStrokeRef.current);
  }

  function finishStroke() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentStrokeRef.current.length > 1) {
      onStrokesChange(strokes.concat([currentStrokeRef.current]));
    }
    currentStrokeRef.current = [];
  }

  function clearAll() {
    if (strokes.length === 0) return;
    const ok = window.confirm("Clear all marks on this diagram?");
    if (!ok) return;
    onStrokesChange([]);
  }

  return html`
    <div class="car-diagram-outer">
      <div class=${"car-diagram-wrap " + wrapClass}>
        <canvas
          class="car-diagram-canvas"
          ref=${canvasRef}
          width=${canvasW}
          height=${canvasH}
          onPointerDown=${handlePointerDown}
          onPointerMove=${handlePointerMove}
          onPointerUp=${finishStroke}
          onPointerLeave=${finishStroke}
        ></canvas>
      </div>
      ${!disabled &&
      !exportMode &&
      html`
        <button type="button" class="car-diagram-clear no-print" onClick=${clearAll}>
          Clear marks
        </button>
      `}
    </div>
  `;
}

function DiagramNotes({ view, data, onChange, exportMode }) {
  return html`
    <div class="diagram-notes-wrap">
      <div class="notes-lines">
        ${DIAGRAM_NOTES_LINE_INDEXES.map((i) => html`<div class="notes-line" key=${i}></div>`)}
      </div>
      <${RichText}
        className="notes-box ruled-fill"
        value=${data.note}
        onChange=${(html) => onChange(view.key, { note: html })}
        multiline=${true}
        exportMode=${exportMode}
      />
    </div>
  `;
}

// Renders a fixed slice of a view's photos (the caller decides how many fit
// on this particular page — see PHOTO caps below) plus, on the primary
// diagram page only, a note pointing at the continuation page holding the
// rest, so nothing is ever silently cut off on export.
function DiagramPhotoGrid({ view, photos, exportMode, onRemovePhoto, overflowCount, continuedOnPage }) {
  if (!photos.length && !overflowCount) return null;
  return html`
    <div class="diagram-photo-grid-wrap">
      <div class="diagram-photo-grid">
        ${photos.map(
          (photo) => html`
            <div class="diagram-photo-card" key=${photo.id}>
              <img src=${photo.dataUrl} alt=${view.label + " photo"} />
              ${!exportMode &&
              html`
                <button
                  type="button"
                  class="diagram-photo-remove no-print"
                  onClick=${() => onRemovePhoto(view.key, photo.id)}
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              `}
            </div>
          `
        )}
      </div>
      ${overflowCount > 0 &&
      html`
        <div class="diagram-photo-overflow-note">
          + ${overflowCount} more photo${overflowCount === 1 ? "" : "s"} — see Page ${continuedOnPage}
        </div>
      `}
    </div>
  `;
}

// One view = its diagram + a notes field + a multi-photo gallery scoped to
// that view (e.g. two separate front-bumper scratches each get their own
// photo, both filed under "Front View"). layout="split" puts the diagram
// and notes side by side (used for the standalone bird's-eye view, which
// otherwise leaves the right half of the page empty); layout="stacked"
// keeps the notes below the diagram (used when two views already share a
// page side by side, so there's no width left to split further).
//
// `photos` is the page-local, capped slice actually shown here (not
// data.photos directly) — a page has a fixed A4 height, so once a view has
// more photos than comfortably fit alongside its diagram+notes, the rest
// spill onto a dedicated continuation page built by the caller (see
// PrePurchaseInspectionCard's buildPages()). The "Add Photo" count badge
// still reflects the true total.
function DiagramView({ view, data, photos, overflowCount, continuedOnPage, onChange, exportMode, onAddPhotoClick, onRemovePhoto, layout }) {
  const drawer = PPI_DIAGRAM_DRAWERS[view.key];
  const diagram = html`
    <${CarDamageDiagram}
      strokes=${data.strokes}
      onStrokesChange=${(s) => onChange(view.key, { strokes: s })}
      exportMode=${exportMode}
      drawBg=${drawer.draw}
      canvasW=${drawer.canvasW}
      canvasH=${drawer.canvasH}
      wrapClass=${drawer.wrapClass}
    />
  `;
  const header = html`
    <div class="diagram-view-header">
      <span class="diagram-view-title">${view.label}</span>
      ${!exportMode &&
      html`
        <button type="button" class="diagram-photo-btn no-print" onClick=${() => onAddPhotoClick(view.key)}>
          📷 Add Photo${data.photos.length ? ` (${data.photos.length})` : ""}
        </button>
      `}
    </div>
  `;
  const photoGrid = html`
    <${DiagramPhotoGrid}
      view=${view}
      photos=${photos}
      exportMode=${exportMode}
      onRemovePhoto=${onRemovePhoto}
      overflowCount=${overflowCount}
      continuedOnPage=${continuedOnPage}
    />
  `;

  if (layout === "split") {
    return html`
      <div class="diagram-view diagram-view-split">
        <div class="diagram-split-row">
          <div class="diagram-col">${diagram}</div>
          <div class="notes-col">
            ${header}
            <${DiagramNotes} view=${view} data=${data} onChange=${onChange} exportMode=${exportMode} />
            ${photoGrid}
          </div>
        </div>
      </div>
    `;
  }

  return html`
    <div class="diagram-view diagram-view-stacked">
      ${header}
      ${diagram}
      <${DiagramNotes} view=${view} data=${data} onChange=${onChange} exportMode=${exportMode} />
      ${photoGrid}
    </div>
  `;
}

// `visibleItems` is the page-local slice actually rendered here (see the
// same rationale as DiagramPhotoGrid — a page has a fixed A4 height, so a
// long repair list spills onto a continuation page rather than silently
// growing past one printable sheet). `items` (the full list) still drives
// add/remove/total math regardless of which page an item is shown on.
// The total/valuation only render on whichever page is last (showTotals),
// and "+ Add item" only appears there too, so new rows always land at the
// end of the list.
var EVAL_PRICE_FIELDS = [
  { key: "marketPrice", label: "Market Price" },
  { key: "tradeInPrice", label: "Trade-In Price" },
  { key: "projectedSalePrice", label: "Projected Sale Price" },
];

function EvaluationSection({
  items,
  visibleItems,
  onItemsChange,
  prices,
  onPriceChange,
  exportMode,
  overflowCount,
  continuedOnPage,
  showAddButton,
  showTotals,
}) {
  function addItem() {
    onItemsChange(items.concat([{ id: Date.now() + "-" + Math.random().toString(36).slice(2), desc: "", cost: "" }]));
  }
  function updateItem(id, key, value) {
    onItemsChange(items.map((it) => (it.id === id ? { ...it, [key]: value } : it)));
  }
  function removeItem(id) {
    onItemsChange(items.filter((it) => it.id !== id));
  }
  const total = items.reduce((sum, it) => sum + (parseFloat(it.cost) || 0), 0);

  return html`
    <div>
      <div class="eval-table">
        <div class="eval-row eval-row-head">
          <span>Item required to fix</span>
          <span>Est. Cost</span>
        </div>
        ${visibleItems.map(
          (item) => html`
            <div class="eval-row" key=${item.id}>
              <${RichText}
                className="eval-desc-input"
                value=${item.desc}
                onChange=${(html) => updateItem(item.id, "desc", html)}
                placeholder="e.g. front tyres, timing belt..."
                exportMode=${exportMode}
              />
              ${exportMode
                ? html`<div class="eval-cost-input export-text">${item.cost ? "$" + item.cost : ""}</div>`
                : html`
                    <input
                      type="text"
                      inputMode="decimal"
                      class="eval-cost-input"
                      value=${item.cost}
                      placeholder="$"
                      onChange=${(e) => {
                        const v = e.target.value;
                        if (/^\d*\.?\d{0,2}$/.test(v)) updateItem(item.id, "cost", v);
                      }}
                    />
                  `}
              ${!exportMode &&
              html`
                <button type="button" class="eval-remove-btn no-print" onClick=${() => removeItem(item.id)} aria-label="Remove item">
                  ✕
                </button>
              `}
            </div>
          `
        )}
        ${showAddButton &&
        !exportMode &&
        html`
          <button type="button" class="eval-add-btn no-print" onClick=${addItem}>+ Add item</button>
        `}
        ${overflowCount > 0 &&
        html`
          <div class="eval-overflow-note">
            + ${overflowCount} more item${overflowCount === 1 ? "" : "s"} — see Page ${continuedOnPage}
          </div>
        `}
        ${showTotals &&
        html`
          <div class="eval-total-row">
            <span>Estimated Total to Fix</span>
            <span>$${total.toFixed(2)}</span>
          </div>
        `}
      </div>
      ${showTotals &&
      html`
        <div class="eval-price-grid">
          ${EVAL_PRICE_FIELDS.map(
            (f) => html`
              <div class="eval-price-box" key=${f.key}>
                <span class="eval-price-label">${f.label}</span>
                ${exportMode
                  ? html`<div class="eval-price-input export-text">${prices[f.key]}</div>`
                  : html`
                      <input
                        type="text"
                        inputMode="decimal"
                        class="eval-price-input"
                        value=${prices[f.key]}
                        placeholder="$"
                        onChange=${(e) => {
                          const v = e.target.value;
                          if (/^\d*\.?\d{0,2}$/.test(v)) onPriceChange(f.key, v);
                        }}
                      />
                    `}
              </div>
            `
          )}
        </div>
      `}
    </div>
  `;
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// A .page has a fixed A4 height, but photo cards are large (per the "make
// them visible" request), so only a few fit alongside a diagram+notes
// before the page would silently grow past one printable sheet and get
// clipped on export. These caps were measured empirically against the
// actual rendered layout (see memory) — once a view has more photos than
// its cap, the rest spill onto a dedicated continuation page instead of
// being lost.
// Bird's-eye's notes-col doesn't stretch to match the (much taller) diagram
// column next to it (the split row uses align-items:start), which leaves
// real unused space below the notes box — the photo grid now lives inside
// that column (under the notes box) instead of full-width below the whole
// row, so it can use that slack instead of growing the page. Measured
// empirically: exactly 1 photo fits in that leftover space (the notes-col
// isn't quite wide enough for a 2nd photo to sit alongside it, so a 2nd
// photo wraps to a new row and overflows) — matches the actual ask, since
// the goal was specifically "one photo shouldn't force a new page."
var PHOTO_CAP_SPLIT = 1;
// front/rear/left/right now share one page (two stacked two-col rows, same
// dimensions as before) — measured empirically that the page sits at
// exactly the A4 budget with 0 photos, so there's no slack for any inline
// photos; every photo goes straight to its own continuation page.
var PHOTO_CAP_STACKED = 0;
var PHOTO_CAP_CONTINUATION = 6; // dedicated full-width photo-only page (2 cols x 3 rows), matching the General Service Photos page reference

// Same reasoning applied to the Evaluation table — Evaluation has its own
// dedicated page (just a page-label + section-title + table, same shape as
// a continuation page), so both caps are measured/verified the same way.
var EVAL_ROW_CAP = 14;
var EVAL_CONTINUATION_CAP = 14;

// Same lights/wipers/engine-light checks General Service runs before a
// service — still worth doing on a car someone's about to buy, just folded
// into PPI's Vehicle Checks instead of getting its own "Pre-Service" title,
// which wouldn't make sense here (nothing's being serviced). Logbook is
// deliberately left out — PPI already has its own richer Logbook control.
function buildInitialFunctionCheck() {
  const front = {};
  PRE_SERVICE_FRONT_ITEMS.forEach((item) => {
    front[item.key] = { status: "", note: "" };
  });
  const rear = {};
  PRE_SERVICE_REAR_ITEMS.forEach((item) => {
    rear[item.key] = { status: "", note: "" };
  });
  return {
    front,
    rear,
    [FRONT_WIPER_ITEM.key]: { status: "", note: "" },
    [REAR_WIPER_ITEM.key]: { status: "", note: "" },
    [ENGINE_LIGHT_ITEM.key]: { status: "" },
  };
}

function buildInitialDiagrams() {
  const d = {};
  PPI_DIAGRAM_VIEWS.forEach((v) => {
    d[v.key] = { strokes: [], note: DIAGRAM_NOTES_BLANK_VALUE, photos: [] };
  });
  return d;
}

function PrePurchaseInspectionCard({ onChangeTemplate, jobId: initialJobId, initialStatus, initialState, user }) {
  // When resuming a saved job, initialState carries every persisted field;
  // seed() falls back to the normal blank-card default for anything it
  // doesn't have (also covers older saves from before a new field existed).
  function seed(key, fallback) {
    return initialState && initialState[key] !== undefined ? initialState[key] : fallback;
  }
  const [header, setHeader] = React.useState(() =>
    seed(
      "header",
      (() => {
        const h = {};
        HEADER_FIELDS.forEach((f) => (h[f.key] = ""));
        return h;
      })()
    )
  );
  const [diagrams, setDiagrams] = React.useState(() => seed("diagrams", buildInitialDiagrams()));
  const [keys, setKeys] = React.useState(() => seed("keys", ""));
  const [logbook, setLogbook] = React.useState(() => seed("logbook", { status: "", note: "" }));
  const [ppsr, setPpsr] = React.useState(() => seed("ppsr", { status: "", note: "" }));
  const [functionCheck, setFunctionCheck] = React.useState(() => seed("functionCheck", buildInitialFunctionCheck()));
  const [aboveCar, setAboveCar] = React.useState(() =>
    seed(
      "aboveCar",
      (() => {
        const a = {};
        ABOVE_CAR_ITEMS.forEach((item) => (a[item.key] = { status: "", note: "" }));
        return a;
      })()
    )
  );
  const [underCar, setUnderCar] = React.useState(() =>
    seed(
      "underCar",
      (() => {
        const u = {};
        UNDER_CAR_ITEMS.forEach((item) => (u[item.key] = ""));
        return u;
      })()
    )
  );
  const [wheels, setWheels] = React.useState(() => seed("wheels", buildInitialState().wheels));
  const [tyrePressure, setTyrePressure] = React.useState(() => seed("tyrePressure", buildInitialState().tyrePressure));
  const [tyreSize, setTyreSize] = React.useState(() => seed("tyreSize", buildInitialState().tyreSize));
  const [notesLeft, setNotesLeft] = React.useState(() => seed("notesLeft", FILL_BLANK_VALUE));
  const [notesRight, setNotesRight] = React.useState(() => seed("notesRight", FILL_BLANK_VALUE));
  const [evalItems, setEvalItems] = React.useState(() => seed("evalItems", []));
  const [prices, setPrices] = React.useState(() =>
    seed("prices", { marketPrice: "", tradeInPrice: "", projectedSalePrice: "" })
  );
  const updatePrice = (key, value) => setPrices((prev) => ({ ...prev, [key]: value }));
  const [exporting, setExporting] = React.useState(false);
  const [exportError, setExportError] = React.useState("");
  const [exportMode, setExportMode] = React.useState(false);

  // Local save/resume (see storage.js) — no network sync yet, so this only
  // tracks the card on the device it was saved on.
  const [jobId, setJobId] = React.useState(initialJobId || null);
  const [jobStatus, setJobStatus] = React.useState(initialStatus || "in-progress");
  const [startedAt, setStartedAt] = React.useState(() => seed("startedAt", null));
  const [completedAt, setCompletedAt] = React.useState(() => seed("completedAt", null));
  const isOwner = !!(user && user.email === OWNER_EMAIL);
  const [editUnlocked, setEditUnlocked] = React.useState(false);
  const locked = jobStatus === "prefilled" || (jobStatus === "completed" && !editUnlocked);

  const pageRefs = React.useRef([]);
  const photoInputRef = React.useRef(null);
  const pendingPhotoViewRef = React.useRef(null);

  const updateHeader = (key, value) => setHeader((prev) => ({ ...prev, [key]: value }));

  const updateDiagram = (viewKey, patch) =>
    setDiagrams((prev) => ({ ...prev, [viewKey]: { ...prev[viewKey], ...patch } }));

  function requestDiagramPhoto(viewKey) {
    pendingPhotoViewRef.current = viewKey;
    photoInputRef.current.click();
  }

  async function handleDiagramPhotoSelected(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    const viewKey = pendingPhotoViewRef.current;
    if (!file || !viewKey) return;
    const dataUrl = await resizeImageFile(file);
    const photo = { id: Date.now() + "-" + Math.random().toString(36).slice(2), dataUrl };
    setDiagrams((prev) => ({
      ...prev,
      [viewKey]: { ...prev[viewKey], photos: prev[viewKey].photos.concat([photo]) },
    }));
  }

  const removeDiagramPhoto = (viewKey, photoId) =>
    setDiagrams((prev) => ({
      ...prev,
      [viewKey]: { ...prev[viewKey], photos: prev[viewKey].photos.filter((p) => p.id !== photoId) },
    }));

  const updateAboveCarStatus = (key, status) =>
    setAboveCar((prev) => ({ ...prev, [key]: { ...prev[key], status } }));
  const updateAboveCarNote = (key, note) =>
    setAboveCar((prev) => ({ ...prev, [key]: { ...prev[key], note } }));

  const updateFunctionCheckStatus = (side, key, status) =>
    setFunctionCheck((prev) => ({
      ...prev,
      [side]: { ...prev[side], [key]: { ...prev[side][key], status } },
    }));
  const updateFunctionCheckNote = (side, key, note) =>
    setFunctionCheck((prev) => ({
      ...prev,
      [side]: { ...prev[side], [key]: { ...prev[side][key], note } },
    }));
  const updateFunctionCheckSimple = (key, status) =>
    setFunctionCheck((prev) => ({ ...prev, [key]: { ...prev[key], status } }));
  const updateFunctionCheckSimpleNote = (key, note) =>
    setFunctionCheck((prev) => ({ ...prev, [key]: { ...prev[key], note } }));
  const updateUnderCar = (key, value) => setUnderCar((prev) => ({ ...prev, [key]: value }));

  const updateWheel = (wheelKey, metricKey, subKey, value) =>
    setWheels((prev) => ({
      ...prev,
      [wheelKey]: { ...prev[wheelKey], [metricKey]: { ...prev[wheelKey][metricKey], [subKey]: value } },
    }));
  const updateTyrePressure = (axleKey, value) => setTyrePressure((prev) => ({ ...prev, [axleKey]: value }));
  const updateTyreSize = (axleKey, value) => setTyreSize((prev) => ({ ...prev, [axleKey]: value }));

  function changeTemplate() {
    const ok = window.confirm("Leave this job card? Any unsaved changes will be lost.");
    if (!ok) return;
    onChangeTemplate();
  }

  function resetAll() {
    const ok = window.confirm("Start a new card? This clears every field, drawing and photo on this job card.");
    if (!ok) return;
    const h = {};
    HEADER_FIELDS.forEach((f) => (h[f.key] = ""));
    const fresh = buildInitialState();
    setHeader(h);
    setDiagrams(buildInitialDiagrams());
    setKeys("");
    setLogbook({ status: "", note: "" });
    setPpsr({ status: "", note: "" });
    setFunctionCheck(buildInitialFunctionCheck());
    const a = {};
    ABOVE_CAR_ITEMS.forEach((item) => (a[item.key] = { status: "", note: "" }));
    setAboveCar(a);
    const u = {};
    UNDER_CAR_ITEMS.forEach((item) => (u[item.key] = ""));
    setUnderCar(u);
    setWheels(fresh.wheels);
    setTyrePressure(fresh.tyrePressure);
    setTyreSize(fresh.tyreSize);
    setNotesLeft(FILL_BLANK_VALUE);
    setNotesRight(FILL_BLANK_VALUE);
    setEvalItems([]);
    setPrices({ marketPrice: "", tradeInPrice: "", projectedSalePrice: "" });
    setExportError("");
    setJobId(null);
    setJobStatus("in-progress");
  }

  function buildFilename() {
    const parts = [header.customer, header.registration, header.date].filter((v) => v && v.trim());
    const raw = parts.length ? parts.join("_") : "pre-purchase-inspection";
    return raw.replace(/[^a-zA-Z0-9_-]+/g, "_") + ".pdf";
  }

  function buildSaveableState() {
    return {
      header, diagrams, keys, logbook, ppsr, functionCheck,
      aboveCar, underCar, wheels, tyrePressure, tyreSize,
      notesLeft, notesRight, evalItems, prices, startedAt, completedAt,
    };
  }

  function persistJob(status, stateOverrides) {
    const id = jobId || generateJobId();
    if (!jobId) setJobId(id);
    const job = {
      id,
      template: "pre-purchase-inspection",
      status,
      label: buildJobLabel(header),
      savedAt: Date.now(),
      state: Object.assign(buildSaveableState(), stateOverrides || {}),
    };
    saveJob(job);
    syncSaveJob(job, user && user.email).catch((err) => {
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

  async function exportPDF() {
    setExportError("");
    setExporting(true);
    setExportMode(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pages = pageRefs.current.filter(Boolean);
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
        await uploadJobPdf(jobId, blob);
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

  // Page list is rebuilt every render from current photo counts, so adding
  // or removing a photo can push views onto/off a continuation page
  // immediately (not just at export time) — what you see on screen is
  // exactly what will end up in the PDF, page numbers included.
  function buildContinuations(view, cap) {
    const overflow = diagrams[view.key].photos.slice(cap);
    if (!overflow.length) return [];
    const chunks = chunkArray(overflow, PHOTO_CAP_CONTINUATION);
    return chunks.map((photos, idx) => ({
      type: "continuation",
      view,
      photos,
      partIndex: idx + 1,
      partTotal: chunks.length,
    }));
  }

  const evalOverflowItems = evalItems.slice(EVAL_ROW_CAP);
  const evalContinuations = chunkArray(evalOverflowItems, EVAL_CONTINUATION_CAP).map((chunkItems, idx, arr) => ({
    type: "evaluation-continuation",
    items: chunkItems,
    isLast: idx === arr.length - 1,
  }));

  const pages = [
    { type: "header-checks" },
    ...buildContinuations(PPI_DIAGRAM_VIEWS[0], PHOTO_CAP_SPLIT),
    { type: "diagram-quad", views: [PPI_DIAGRAM_VIEWS[1], PPI_DIAGRAM_VIEWS[2], PPI_DIAGRAM_VIEWS[3], PPI_DIAGRAM_VIEWS[4]] },
    ...buildContinuations(PPI_DIAGRAM_VIEWS[1], PHOTO_CAP_STACKED),
    ...buildContinuations(PPI_DIAGRAM_VIEWS[2], PHOTO_CAP_STACKED),
    ...buildContinuations(PPI_DIAGRAM_VIEWS[3], PHOTO_CAP_STACKED),
    ...buildContinuations(PPI_DIAGRAM_VIEWS[4], PHOTO_CAP_STACKED),
    { type: "above-under-notes" },
    { type: "evaluation" },
    ...evalContinuations,
  ];

  function continuationPageNumber(viewKey) {
    const idx = pages.findIndex((p) => p.type === "continuation" && p.view.key === viewKey);
    return idx === -1 ? null : idx + 1;
  }

  const evalContinuedOnPage = evalContinuations.length ? pages.findIndex((p) => p.type === "evaluation-continuation") + 1 : null;

  function viewPhotoProps(view, cap) {
    const all = diagrams[view.key].photos;
    return {
      photos: all.slice(0, cap),
      overflowCount: Math.max(0, all.length - cap),
      continuedOnPage: continuationPageNumber(view.key),
    };
  }

  return html`
    <div class="app">
      <header class="topbar no-print">
        <h1 class="app-title">Pre-Purchase Inspection</h1>
        <div class="topbar-actions">
          ${exportError && html`<span class="export-error">${exportError}</span>`}
          <button type="button" class="btn btn-secondary" onClick=${changeTemplate}>← Templates</button>
          ${jobStatus === "prefilled"
            ? html`
                <button type="button" class="btn btn-primary" onClick=${startJob}>Start Job</button>
              `
            : html`
                ${jobStatus !== "completed" &&
                html`<button type="button" class="btn btn-secondary" onClick=${resetAll}>New card / Clear all</button>`}
                ${(jobStatus !== "completed" || editUnlocked) &&
                html`<button type="button" class="btn btn-secondary" onClick=${saveProgress}>Save Progress</button>`}
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
                      <button type="button" class="btn btn-secondary" onClick=${markComplete}>Mark Complete</button>
                    `}
                <button type="button" class="btn btn-primary" onClick=${exportPDF} disabled=${exporting}>
                  ${exporting ? "Exporting…" : "Export as PDF"}
                </button>
              `}
        </div>
      </header>

      <main class=${"pages" + (locked ? " pages-locked" : "")}>
        ${pages.map((desc, i) => {
          const setRef = (el) => {
            pageRefs.current[i] = el;
          };

          if (desc.type === "header-checks") {
            const view = PPI_DIAGRAM_VIEWS[0];
            const vp = viewPhotoProps(view, PHOTO_CAP_SPLIT);
            return html`
              <section class="page" key=${i} ref=${setRef}>
                <div class="page-label">Page ${i + 1}</div>

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

                <div class="section-title">Vehicle Checks</div>
                <div class="ppi-checks-panel">
                  <div class="ppi-checks-row">
                    <${SimpleCheckRow} label="Keys" status=${keys} onChange=${setKeys} options=${KEYS_OPTIONS} />
                    <${LightCheckRow}
                      item=${{ key: "ppsr", label: "PPSR Check" }}
                      entry=${ppsr}
                      onStatus=${(k, v) => setPpsr((prev) => ({ ...prev, status: v }))}
                      onNote=${(k, v) => setPpsr((prev) => ({ ...prev, note: v }))}
                      options=${PPSR_OPTIONS}
                      notePlaceholder="details (optional)"
                      exportMode=${exportMode}
                    />
                    <${SimpleCheckRow}
                      label=${ENGINE_LIGHT_ITEM.label}
                      status=${functionCheck[ENGINE_LIGHT_ITEM.key].status}
                      onChange=${(v) => updateFunctionCheckSimple(ENGINE_LIGHT_ITEM.key, v)}
                    />
                  </div>
                  <div class="ppi-logbook-row">
                    <span class="light-label">Logbook</span>
                    <span class="light-label-hint">(F)ull / (P)artial / (N)one / (E)-Log</span>
                    <${StatusToggle}
                      value=${logbook.status}
                      onChange=${(v) => setLogbook((prev) => ({ ...prev, status: v }))}
                      options=${PPI_LOGBOOK_OPTIONS}
                    />
                    ${exportMode
                      ? html`<div class="light-note export-text">${logbook.note}</div>`
                      : html`
                          <input
                            type="text"
                            class="light-note"
                            placeholder="details (optional)"
                            value=${logbook.note}
                            onChange=${(e) => setLogbook((prev) => ({ ...prev, note: e.target.value }))}
                          />
                        `}
                  </div>
                </div>

                <div class="prelights-grid">
                  <div class="prelights-col">
                    <div class="prelights-heading">Lights & Wipers — Front</div>
                    ${PRE_SERVICE_FRONT_ITEMS.map(
                      (item) => html`
                        <${LightCheckRow}
                          key=${item.key}
                          item=${item}
                          entry=${functionCheck.front[item.key]}
                          onStatus=${(k, v) => updateFunctionCheckStatus("front", k, v)}
                          onNote=${(k, v) => updateFunctionCheckNote("front", k, v)}
                          exportMode=${exportMode}
                        />
                      `
                    )}
                    <${LightCheckRow}
                      item=${FRONT_WIPER_ITEM}
                      entry=${functionCheck[FRONT_WIPER_ITEM.key]}
                      onStatus=${(k, v) => updateFunctionCheckSimple(k, v)}
                      onNote=${(k, v) => updateFunctionCheckSimpleNote(k, v)}
                      exportMode=${exportMode}
                      options=${STATUS_OPTIONS_CONDITION}
                      notePlaceholder="note"
                    />
                  </div>
                  <div class="prelights-col">
                    <div class="prelights-heading">Lights & Wipers — Rear</div>
                    ${PRE_SERVICE_REAR_ITEMS.map(
                      (item) => html`
                        <${LightCheckRow}
                          key=${item.key}
                          item=${item}
                          entry=${functionCheck.rear[item.key]}
                          onStatus=${(k, v) => updateFunctionCheckStatus("rear", k, v)}
                          onNote=${(k, v) => updateFunctionCheckNote("rear", k, v)}
                          exportMode=${exportMode}
                        />
                      `
                    )}
                    <${LightCheckRow}
                      item=${REAR_WIPER_ITEM}
                      entry=${functionCheck[REAR_WIPER_ITEM.key]}
                      onStatus=${(k, v) => updateFunctionCheckSimple(k, v)}
                      onNote=${(k, v) => updateFunctionCheckSimpleNote(k, v)}
                      exportMode=${exportMode}
                      options=${STATUS_OPTIONS_CONDITION}
                      notePlaceholder="note"
                    />
                  </div>
                </div>

                <div class="section-title">Damage Diagram <span class="hint">(circle any damage or wear, then attach a photo)</span></div>
                <${DiagramView}
                  view=${view}
                  data=${diagrams.birdsEye}
                  photos=${vp.photos}
                  overflowCount=${vp.overflowCount}
                  continuedOnPage=${vp.continuedOnPage}
                  onChange=${updateDiagram}
                  exportMode=${exportMode}
                  onAddPhotoClick=${requestDiagramPhoto}
                  onRemovePhoto=${removeDiagramPhoto}
                  layout="split"
                />
              </section>
            `;
          }

          if (desc.type === "diagram-quad") {
            return html`
              <section class="page" key=${i} ref=${setRef}>
                <div class="page-label">Page ${i + 1}</div>
                <div class="section-title">Damage Diagram <span class="hint">(front & rear)</span></div>
                <div class="two-col">
                  ${desc.views.slice(0, 2).map((view) => {
                    const vp = viewPhotoProps(view, PHOTO_CAP_STACKED);
                    return html`
                      <${DiagramView}
                        key=${view.key}
                        view=${view}
                        data=${diagrams[view.key]}
                        photos=${vp.photos}
                        overflowCount=${vp.overflowCount}
                        continuedOnPage=${vp.continuedOnPage}
                        onChange=${updateDiagram}
                        exportMode=${exportMode}
                        onAddPhotoClick=${requestDiagramPhoto}
                        onRemovePhoto=${removeDiagramPhoto}
                        layout="stacked"
                      />
                    `;
                  })}
                </div>

                <div class="section-title">Damage Diagram <span class="hint">(left & right side)</span></div>
                <div class="two-col">
                  ${desc.views.slice(2, 4).map((view) => {
                    const vp = viewPhotoProps(view, PHOTO_CAP_STACKED);
                    return html`
                      <${DiagramView}
                        key=${view.key}
                        view=${view}
                        data=${diagrams[view.key]}
                        photos=${vp.photos}
                        overflowCount=${vp.overflowCount}
                        continuedOnPage=${vp.continuedOnPage}
                        onChange=${updateDiagram}
                        exportMode=${exportMode}
                        onAddPhotoClick=${requestDiagramPhoto}
                        onRemovePhoto=${removeDiagramPhoto}
                        layout="stacked"
                      />
                    `;
                  })}
                </div>
              </section>
            `;
          }

          if (desc.type === "continuation") {
            return html`
              <section class="page" key=${i} ref=${setRef}>
                <div class="page-label">Page ${i + 1}</div>
                <div class="section-title">
                  ${desc.view.label} — Photos (continued)${desc.partTotal > 1 ? ` ${desc.partIndex}/${desc.partTotal}` : ""}
                </div>
                <div class="diagram-photo-grid">
                  ${desc.photos.map(
                    (photo) => html`
                      <div class="diagram-photo-card" key=${photo.id}>
                        <img src=${photo.dataUrl} alt=${desc.view.label + " photo"} />
                        ${!exportMode &&
                        html`
                          <button
                            type="button"
                            class="diagram-photo-remove no-print"
                            onClick=${() => removeDiagramPhoto(desc.view.key, photo.id)}
                            aria-label="Remove photo"
                          >
                            ✕
                          </button>
                        `}
                      </div>
                    `
                  )}
                </div>
              </section>
            `;
          }

          if (desc.type === "above-under-notes") {
            return html`
              <section class="page" key=${i} ref=${setRef}>
                <div class="page-label">Page ${i + 1}</div>
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
                        onChange=${updateUnderCar}
                        exportMode=${exportMode}
                      />
                    `
                  )}
                </div>

                <div class="section-title">Notes</div>
                <div class="book-wrap">
                  <div class="book-page">
                    <div class="notes-lines">
                      ${FILL_LINE_INDEXES.map((idx) => html`<div class="notes-line" key=${idx}></div>`)}
                    </div>
                    <${RichText}
                      className="notes-box book-notes ruled-fill"
                      value=${notesLeft}
                      onChange=${setNotesLeft}
                      multiline=${true}
                      exportMode=${exportMode}
                    />
                  </div>
                  <div class="book-page">
                    <div class="notes-lines">
                      ${FILL_LINE_INDEXES.map((idx) => html`<div class="notes-line" key=${idx}></div>`)}
                    </div>
                    <${RichText}
                      className="notes-box book-notes ruled-fill"
                      value=${notesRight}
                      onChange=${setNotesRight}
                      multiline=${true}
                      exportMode=${exportMode}
                    />
                  </div>
                </div>
              </section>
            `;
          }

          if (desc.type === "evaluation-continuation") {
            return html`
              <section class="page" key=${i} ref=${setRef}>
                <div class="page-label">Page ${i + 1}</div>
                <div class="section-title">Evaluation (continued)</div>
                <${EvaluationSection}
                  items=${evalItems}
                  visibleItems=${desc.items}
                  onItemsChange=${setEvalItems}
                  prices=${prices}
                  onPriceChange=${updatePrice}
                  exportMode=${exportMode}
                  overflowCount=${0}
                  continuedOnPage=${null}
                  showAddButton=${desc.isLast}
                  showTotals=${desc.isLast}
                />
              </section>
            `;
          }

          return html`
            <section class="page" key=${i} ref=${setRef}>
              <div class="page-label">Page ${i + 1}</div>
              <div class="section-title">Evaluation</div>
              <${EvaluationSection}
                items=${evalItems}
                visibleItems=${evalItems.slice(0, EVAL_ROW_CAP)}
                onItemsChange=${setEvalItems}
                prices=${prices}
                onPriceChange=${updatePrice}
                exportMode=${exportMode}
                overflowCount=${evalOverflowItems.length}
                continuedOnPage=${evalContinuedOnPage}
                showAddButton=${!evalContinuations.length}
                showTotals=${!evalContinuations.length}
              />
            </section>
          `;
        })}

        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref=${photoInputRef}
          style=${{ display: "none" }}
          onChange=${handleDiagramPhotoSelected}
        />
      </main>
    </div>
  `;
}
