// Draw the cursor artwork as a DOM element instead of using the native CSS
// cursor.
//
// Why: a native cursor image is dropped entirely by the browser as soon as any
// part of it would fall outside the window, so a cursor whose artwork extends
// above its hotspot (like an arrow whose tip is at the bottom) disappears near
// the top edge. A DOM element is merely clipped in that situation, which is the
// behaviour we want.
//
// The stylesheet still declares a cursor for every element, but in overlay mode
// it points at a fully transparent image and keeps its trailing keyword
// (auto / pointer / text). Reading that keyword back with getComputedStyle
// tells us which artwork to show, so all of the theme's own cursor rules keep
// working without being duplicated here.
(function () {
  const CFG = (window.REIMU_CONFIG && window.REIMU_CONFIG.cursor_overlay) || null;
  if (!CFG) {
    return;
  }

  // Touch devices have no cursor to replace.
  if (
    !window.matchMedia ||
    !window.matchMedia("(hover: hover) and (pointer: fine)").matches
  ) {
    return;
  }

  const KINDS = ["default", "pointer", "text"];
  const layers = {};
  let current = null;
  let raf = 0;
  let pending = null;
  let lastPos = null;
  let started = false;

  // The trailing keyword of the computed cursor value says what the element
  // wants. The leading url() is a transparent image, and a data: URI contains
  // commas, so match the keyword at the end rather than splitting on commas.
  function keywordOf(raw) {
    const m = /([a-z-]+)\s*$/.exec(String(raw || ""));
    return m ? m[1] : "default";
  }

  // Text-ish inputs want a caret; widgets like checkboxes keep the arrow.
  const TEXT_INPUT_TYPES = /^(text|search|email|url|tel|password|number|date|datetime-local|month|week|time)$/;

  function isEditable(el) {
    const tag = el.tagName;
    if (tag === "TEXTAREA") {
      return true;
    }
    if (tag === "INPUT") {
      const type = String(el.type || "text").toLowerCase();
      return TEXT_INPUT_TYPES.test(type);
    }
    return el.isContentEditable === true;
  }

  // Which artwork the element under (x, y) asks for. The overlay itself is
  // pointer-events:none, so it never appears in elementFromPoint results.
  function kindAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) {
      return "default";
    }
    const kw = keywordOf(getComputedStyle(el).cursor);

    if (kw === "none") {
      return "none";
    }
    if (kw === "pointer") {
      return "pointer";
    }
    if (kw === "text") {
      return "text";
    }
    // `auto` follows native behaviour: a caret over editable text, otherwise
    // the plain arrow.
    return isEditable(el) ? "text" : "default";
  }

  function build() {
    const root = document.createElement("div");
    root.setAttribute("aria-hidden", "true");
    root.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:0",
      "height:0",
      // above everything the theme ships (popups sit at 9999)
      "z-index:2147483647",
      // the overlay must never swallow clicks
      "pointer-events:none",
    ].join(";");

    KINDS.forEach((kind) => {
      const spec = CFG[kind];
      const img = document.createElement("img");
      img.draggable = false;
      img.alt = "";
      img.decoding = "async";
      img.src = spec.src;
      const css = [
        "position:fixed",
        "left:0",
        "top:0",
        // the hotspot is where the pointer sits inside the artwork
        "margin-left:" + -spec.x + "px",
        "margin-top:" + -spec.y + "px",
        "pointer-events:none",
        // dark mode ships a global img { filter: brightness(70%) }; the
        // cursor should keep its real colours
        "filter:none",
        "display:none",
        "will-change:transform",
      ];
      // Only force a size when one is configured; otherwise natural size.
      if (spec.width) {
        css.push("width:" + spec.width + "px");
      }
      if (spec.height) {
        css.push("height:" + spec.height + "px");
      }
      img.style.cssText = css.join(";");
      root.appendChild(img);
      layers[kind] = img;
    });

    document.body.appendChild(root);
  }

  function hideAll() {
    KINDS.forEach((k) => {
      if (layers[k]) {
        layers[k].style.display = "none";
      }
    });
    current = null;
  }

  function render() {
    raf = 0;
    if (!pending) {
      return;
    }
    const x = pending.x;
    const y = pending.y;
    pending = null;

    const kind = kindAt(x, y);
    if (kind !== current) {
      if (current && layers[current]) {
        layers[current].style.display = "none";
      }
      current = kind;
      if (layers[kind]) {
        layers[kind].style.display = "block";
      }
    }
    if (layers[kind]) {
      // translate3d keeps this on the compositor
      layers[kind].style.transform = "translate3d(" + x + "px," + y + "px,0)";
    }
  }

  function schedule() {
    if (!raf) {
      raf = requestAnimationFrame(render);
    }
  }

  function onMove(e) {
    lastPos = { x: e.clientX, y: e.clientY };
    pending = { x: e.clientX, y: e.clientY };
    schedule();
  }

  function repaintAtLastPos() {
    if (lastPos) {
      pending = { x: lastPos.x, y: lastPos.y };
      schedule();
    }
  }

  function start() {
    if (started) {
      return;
    }
    started = true;
    build();

    window.addEventListener("mousemove", onMove, { passive: true });

    // After scrolling the pointer may be over a different element even though
    // it never moved, so repaint.
    window.addEventListener("scroll", repaintAtLastPos, { passive: true });

    // Hide while the pointer is outside the page.
    document.addEventListener("mouseleave", hideAll);
    document.addEventListener("mouseenter", repaintAtLastPos);
  }

  if (document.body) {
    start();
  } else {
    document.addEventListener("DOMContentLoaded", start);
  }
})();