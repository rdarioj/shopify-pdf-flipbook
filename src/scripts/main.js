import { PageFlip } from "page-flip/dist/js/page-flip.module.js";
import "page-flip/src/Style/stPageFlip.css";
import { loadPdf, loadPdfFromUrl, renderPageToCanvas, renderThumbToCanvas } from "./pdf-handler.js";
import { detectProducts } from "./product-detector.js";
import { generateButtons } from "./shopify-integration.js";
import { showError, updateUI as uiUpdate } from "./ui-controller.js";
import { attachHotspots, scheduleHotspotSync } from "./hotspots.js";
import { resetHotspotsToBundled } from "./hotspots-data.js";
import { getFlipbookRuntime } from "./flipbook-runtime.js";
import { installHotspotEditor, mountEditorSurfaces, isHotspotEditorActive } from "./hotspot-editor.js";
import { mountWhatsAppCartUI } from "./whatsapp-cart-ui.js";
import { mountB2BDemoHints, setB2BGoToPage } from "./b2b-demo-hints.js";
import {
  installEditorCatalogPicker,
  resolveInitialEditorCatalog,
} from "./editor-catalog-picker.js";

const VIEW_MODE_KEY = "flipbook-view-mode";
const MOBILE_MAX_WIDTH = 720;
/** Zoom desactivado hasta reimplementarlo sin romper layout. */
const ZOOM_ENABLED = false;

const state = {
  zoom: 1,
  pdfObj: null,
  pageFlip: null,
  currentPageIndex: 0,
  resizeTimer: null,
  pageDisplayWidth: 0,
  basePageWidth: 0,
  singlePage: false,
};

let buildSerial = 0;

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
}

function getStoredViewMode() {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(VIEW_MODE_KEY);
  return v === "single" || v === "spread" ? v : null;
}

function getEffectiveSinglePage() {
  if (isMobileViewport()) return true;
  const stored = getStoredViewMode();
  if (stored === "single") return true;
  if (stored === "spread") return false;
  return getFlipbookRuntime().singlePage === true;
}

function setViewMode(mode) {
  if (isMobileViewport()) return;
  const single = mode === "single";
  localStorage.setItem(VIEW_MODE_KEY, single ? "single" : "spread");
  state.singlePage = single;
  updateViewModeToggle();
  if (state.pdfObj) buildPageFlip();
}

function updateViewModeToggle() {
  const btn = document.getElementById("viewModeToggleBtn");
  if (!btn) return;
  if (isMobileViewport()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  const single = getEffectiveSinglePage();
  btn.textContent = single ? "1 page" : "2 pages";
  btn.title = single ? "Single page (click for spread)" : "Two-page spread (click for single)";
  btn.setAttribute("aria-pressed", single ? "true" : "false");
  btn.classList.toggle("is-single", single);
}

function installViewModeToggle() {
  const tools = document.querySelector(".flipbook-top-tools");
  if (!tools || document.getElementById("viewModeToggleBtn")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "viewModeToggleBtn";
  btn.className = "flipbook-view-toggle";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setViewMode(getEffectiveSinglePage() ? "spread" : "single");
  });
  tools.insertBefore(btn, tools.firstChild);
  updateViewModeToggle();
}

if (typeof window !== "undefined" && window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.worker.min.js";
}

function destroyPageFlip() {
  if (state.pageFlip) {
    try {
      state.pageFlip.destroy();
    } catch (_) {
      /* ignore */
    }
    state.pageFlip = null;
  }
  document.body.classList.remove("is-mobile");
}

/** 0-based indices of PDF pages currently visible (depends on landscape/portrait inside StPageFlip). */
function getVisiblePdfIndices() {
  const pf = state.pageFlip;
  if (!pf) return [];
  const pc = pf.getPageCollection();
  const spread = pc.getSpread();
  const si = pc.getCurrentSpreadIndex();
  const pair = spread[si];
  return Array.isArray(pair) ? [...pair] : [];
}

function getVisible1BasedPages() {
  return getVisiblePdfIndices().map((i) => i + 1);
}

function updateNavFromPageFlip() {
  const pageInfo = document.getElementById("pageInfo");
  const prev = document.getElementById("prevBtn");
  const next = document.getElementById("nextBtn");

  const pf = state.pageFlip;
  if (!state.pdfObj || !pf) {
    if (prev) prev.disabled = true;
    if (next) next.disabled = true;
    if (pageInfo) pageInfo.textContent = "—";
    return;
  }
  const total = state.pdfObj.pageCount;
  const vis = getVisible1BasedPages();
  const label = vis.length === 2 ? `Pages ${vis[0]}–${vis[1]}` : `Page ${vis[0]}`;
  if (pageInfo) pageInfo.textContent = `${label} · ${total} pages`;

  const pc = pf.getPageCollection();
  const si = pc.getCurrentSpreadIndex();
  const spreads = pc.getSpread();
  if (prev) prev.disabled = si <= 0;
  if (next) next.disabled = si >= spreads.length - 1;
}

function syncEdgeZones() {
  const prevZ = document.querySelector(".flipbook-edge-zone--prev");
  const nextZ = document.querySelector(".flipbook-edge-zone--next");
  const prevB = document.getElementById("prevBtn");
  const nextB = document.getElementById("nextBtn");
  if (prevZ) prevZ.disabled = Boolean(prevB?.disabled);
  if (nextZ) nextZ.disabled = Boolean(nextB?.disabled);
}

function updateScrubber() {
  const scrub = document.getElementById("flipbookScrubber");
  const thumb = document.querySelector(".flipbook-scrubber__thumb");
  const fill = document.querySelector(".flipbook-scrubber__fill");
  if (!scrub || !thumb || !fill) return;

  const pf = state.pageFlip;
  if (!pf || !state.pdfObj) {
    scrub.hidden = true;
    return;
  }
  scrub.hidden = false;
  const pc = pf.getPageCollection();
  const spreads = pc.getSpread();
  const si = pc.getCurrentSpreadIndex();
  const max = Math.max(0, spreads.length - 1);
  const pct = max === 0 ? 0 : (si / max) * 100;
  thumb.style.left = `${pct}%`;
  fill.style.width = `${pct}%`;
  scrub.setAttribute("aria-valuenow", String(si + 1));
  scrub.setAttribute("aria-valuemax", String(spreads.length));
}

function updateChromeNav() {
  updateNavFromPageFlip();
  syncEdgeZones();
  updateScrubber();
}

function getBookSlot() {
  return document.querySelector("#flipbook .flipbook-book-slot");
}

function syncCoverSlotLayout() {
  const slot = getBookSlot();
  const pf = state.pageFlip;
  if (!slot || !pf || !state.pdfObj) return;

  const parent = slot.querySelector(".stf__parent");
  const wrapper = parent?.querySelector(":scope > .stf__wrapper");

  if (pf.getState() !== "read" || pf.getOrientation() !== "landscape") {
    slot.classList.remove("flipbook-slot--first-cover-center");
    if (parent) {
      parent.style.width = "";
      parent.style.overflow = "";
      parent.style.margin = "";
    }
    if (wrapper) wrapper.style.transform = "";
    slot.style.removeProperty("--flipbook-page-w");
    slot.style.removeProperty("--flipbook-page-h");
    return;
  }

  const pc = pf.getPageCollection();
  const spread = pc.getSpread()[pc.getCurrentSpreadIndex()];
  const isCoverSpread = Array.isArray(spread) && spread.length === 1 && spread[0] === 0;
  slot.classList.toggle("flipbook-slot--first-cover-center", isCoverSpread);

  if (isCoverSpread && state.basePageWidth) {
    slot.style.setProperty("--flipbook-page-w", `${state.basePageWidth}px`);
    slot.style.setProperty("--flipbook-page-h", `${Math.round(state.basePageWidth / 0.707)}px`);
    alignCoverSpread(slot, parent, wrapper);
  } else {
    if (parent) {
      parent.style.width = "";
      parent.style.overflow = "";
      parent.style.margin = "";
    }
    if (wrapper) wrapper.style.transform = "";
    slot.style.removeProperty("--flipbook-page-w");
    slot.style.removeProperty("--flipbook-page-h");
  }
}

function alignCoverSpread(slot, parent, wrapper) {
  if (!slot?.classList.contains("flipbook-slot--first-cover-center") || !parent || !wrapper) return;

  const run = () => {
    if (!slot.classList.contains("flipbook-slot--first-cover-center")) return;
    const coverItem = parent.querySelector('.page-inner[data-page-number="1"]')?.closest(".stf__item");
    if (!coverItem) return;

    const pageW = state.basePageWidth;
    const parentRect = parent.getBoundingClientRect();
    const coverRect = coverItem.getBoundingClientRect();
    const offset = coverRect.left - parentRect.left;

    parent.style.width = `${pageW}px`;
    parent.style.maxWidth = "100%";
    parent.style.overflow = "hidden";
    parent.style.margin = "0 auto";
    wrapper.style.transform = offset ? `translateX(${-offset}px)` : "";
  };

  requestAnimationFrame(() => requestAnimationFrame(run));
}

function jumpToSpreadFromRatio(ratio) {
  const pf = state.pageFlip;
  if (!pf) return;
  const pc = pf.getPageCollection();
  const spreads = pc.getSpread();
  const max = Math.max(0, spreads.length - 1);
  const si = Math.min(max, Math.max(0, Math.round(Math.max(0, Math.min(1, ratio)) * max)));
  const pair = spreads[si];
  if (!pair || pair.length === 0) return;
  const pageIdx = pair[0];
  pf.flip(pageIdx, "top");
}

function installFlipbookChrome() {
  const fb = document.getElementById("flipbook");
  if (!fb || fb.dataset.chromeBound === "1") return;
  fb.dataset.chromeBound = "1";

  const prevZ = fb.querySelector(".flipbook-edge-zone--prev");
  const nextZ = fb.querySelector(".flipbook-edge-zone--next");
  const prevV = prevZ?.querySelector(".flipbook-edge-visual");
  const nextV = nextZ?.querySelector(".flipbook-edge-visual");
  prevV?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (prevZ?.disabled) return;
    state.pageFlip?.flipPrev("top");
  });
  nextV?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (nextZ?.disabled) return;
    state.pageFlip?.flipNext("top");
  });

  const track = fb.querySelector(".flipbook-scrubber__track");
  const thumb = fb.querySelector(".flipbook-scrubber__thumb");
  if (track) {
    track.addEventListener("click", (e) => {
      if (e.target.closest(".flipbook-scrubber__thumb")) return;
      const rect = track.getBoundingClientRect();
      const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
      jumpToSpreadFromRatio(ratio);
    });
  }

  let scrubDragging = false;
  const onMove = (e) => {
    if (!scrubDragging || !state.pageFlip) return;
    const tr = document.querySelector(".flipbook-scrubber__track");
    if (!tr) return;
    const rect = tr.getBoundingClientRect();
    const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    jumpToSpreadFromRatio(ratio);
  };
  const onUp = () => {
    scrubDragging = false;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
  thumb?.addEventListener("pointerdown", (e) => {
    if (!state.pageFlip) return;
    scrubDragging = true;
    thumb.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    e.preventDefault();
  });
}

function highlightThumbnails() {
  if (!state.pdfObj) return;
  const visible = new Set(getVisiblePdfIndices());
  document.querySelectorAll("#thumbnails .thumbnail").forEach((thumb) => {
    const p = Number(thumb.dataset.page);
    thumb.classList.toggle("thumbnail--active", visible.has(p - 1));
  });
}

function hideZoomUi() {
  document.getElementById("zoomToggleBtn")?.remove();
  document.querySelector(".flipbook-zoom-rail")?.remove();
  document.getElementById("zoomInBtn")?.remove();
  document.getElementById("zoomOutBtn")?.remove();
  document.getElementById("zoomInfo")?.remove();
  document.getElementById("fitBtn")?.remove();
}

function updateZoomLabel() {
  /* zoom desactivado */
}

function updateToggleIcon() {
  /* zoom desactivado */
}

function setZoomRailVisible() {
  /* zoom desactivado */
}

function centerZoomedView() {
  const slot = getBookSlot();
  if (slot) {
    slot.scrollTop = 0;
    slot.scrollLeft = 0;
  }
}

function updateZoomChrome() {
  const slot = getBookSlot();
  slot?.classList.remove("is-zoomed-in");
  document.getElementById("flipbook")?.classList.remove("is-zoomed");
}

function fitCanvasToPage(canvas) {
  canvas.style.display = "block";
  canvas.style.maxWidth = "100%";
  canvas.style.maxHeight = "100%";
  canvas.style.width = "auto";
  canvas.style.height = "auto";
}

function setZoom() {
  /* zoom desactivado */
}

function toggleZoom() {
  /* zoom desactivado */
}

function zoomIn() {
  /* zoom desactivado */
}

function zoomOut() {
  /* zoom desactivado */
}

function fitToWidth() {
  /* zoom desactivado */
}

function ensureControls() {
  if (!ZOOM_ENABLED) return;
  const onZoomClick = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  const toggle = document.getElementById("zoomToggleBtn");
  if (toggle && toggle.dataset.bound !== "1") {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", onZoomClick(toggleZoom));
  }

  const zInSide = document.getElementById("zoomInSideBtn");
  const zOutSide = document.getElementById("zoomOutSideBtn");

  if (zInSide && zInSide.dataset.bound !== "1") {
    zInSide.dataset.bound = "1";
    zInSide.addEventListener("click", onZoomClick(zoomIn));
    if (zOutSide) {
      zOutSide.dataset.bound = "1";
      zOutSide.addEventListener("click", onZoomClick(zoomOut));
    }
    return;
  }

  if (document.getElementById("zoomInBtn")) return;
  const center = document.querySelector("header.toolbar .center") || document.querySelector("header.toolbar");
  const zOut = document.createElement("button");
  zOut.type = "button";
  zOut.id = "zoomOutBtn";
  zOut.textContent = "−";
  const zInfo = document.createElement("span");
  zInfo.id = "zoomInfo";
  zInfo.textContent = "100%";
  const zIn = document.createElement("button");
  zIn.type = "button";
  zIn.id = "zoomInBtn";
  zIn.textContent = "＋";
  const fit = document.createElement("button");
  fit.type = "button";
  fit.id = "fitBtn";
  fit.title = "Ajustar al ancho";
  fit.textContent = "⇱⇲";
  [zOut, zInfo, zIn, fit].forEach((n) => {
    n.style.margin = "0 4px";
    center.appendChild(n);
  });
  zIn.addEventListener("click", onZoomClick(zoomIn));
  zOut.addEventListener("click", onZoomClick(zoomOut));
  fit.addEventListener("click", onZoomClick(fitToWidth));
}

async function renderThumbnails(pdf) {
  const thumbsEl = document.getElementById("thumbnails");
  if (!thumbsEl || isMobileViewport()) {
    if (thumbsEl) thumbsEl.innerHTML = "";
    return;
  }
  thumbsEl.innerHTML = "";
  const { pageCount } = state.pdfObj;
  for (let i = 1; i <= pageCount; i++) {
    const thumb = document.createElement("div");
    thumb.className = "thumbnail";
    thumb.dataset.page = String(i);
    try {
      const tcanvas = await renderThumbToCanvas(pdf, i, 120);
      thumb.appendChild(tcanvas);
    } catch (e) {
      console.warn("Thumb render failed page", i, e);
    }
    const lab = document.createElement("span");
    lab.className = "thumbnail-label";
    lab.textContent = `Page ${i}`;
    thumb.appendChild(lab);
    thumb.addEventListener("click", () => {
      if (!state.pageFlip) return;
      state.pageFlip.turnToPage(i - 1);
      updateChromeNav();
      highlightThumbnails();
      const flipbookEl = document.getElementById("flipbook");
      scheduleHotspotSync(flipbookEl);
      mountEditorSurfaces(flipbookEl, getVisible1BasedPages());
    });
    thumbsEl.appendChild(thumb);
  }
  highlightThumbnails();
}

function touchDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getMobileFlipZone(pf, globalPos) {
  const render = pf.getRender();
  const rect = render.getRect();
  const bookPos = render.convertToBook(globalPos);
  const pw = rect.pageWidth;
  const reach = Math.hypot(pw, rect.height) / 4;

  if (
    bookPos.x <= 0 ||
    bookPos.y <= 0 ||
    bookPos.x >= rect.width ||
    bookPos.y >= rect.height
  ) {
    return null;
  }

  const top = bookPos.y < reach;
  const bottom = bookPos.y > rect.height - reach;
  if (!top && !bottom) return null;

  if (bookPos.x > rect.width - reach) return "next";

  if (bookPos.x < reach) return "prev";
  if (pf.getOrientation() === "portrait" && bookPos.x < pw + reach * 0.85) return "prev";

  return null;
}

/** Dist coords at outer-left corner — passes library corner check + BACK direction. */
function prevFlipPos(pf, globalPos) {
  const rect = pf.getRender().getRect();
  const bookPos = pf.getRender().convertToBook(globalPos);
  const reach = Math.hypot(rect.pageWidth, rect.height) / 4;
  const yBook = Math.max(reach * 0.4, Math.min(rect.height - reach * 0.4, bookPos.y));
  return { x: rect.left + reach * 0.45, y: rect.top + yBook };
}

function runMobilePrevFlip(pf, fc, origFlip, globalPos) {
  if (pf.getCurrentPageIndex() < 1) return false;
  origFlip.call(fc, prevFlipPos(pf, globalPos));
  return true;
}

/**
 * Mobile portrait: mirror right-corner tap — left zone runs the same flip() animation.
 * Never call flipPrev() here (it re-enters patched flip and silently fails).
 */
function installMobileNaturalFlip(pf) {
  if (!isMobileViewport()) return;

  const fc = pf.getFlipController();
  const dist = pf.getUI()?.getDistElement?.();
  if (!dist) return;

  let touchZone = null;
  let touchHandled = false;
  const origFold = fc.fold.bind(fc);
  const origFlip = fc.flip.bind(fc);
  const origUserStop = pf.userStop.bind(pf);

  const finishFold = () => {
    if (fc.calc !== null) fc.render.finishAnimation();
  };

  fc.flip = function mobileFlip(globalPos) {
    const zone = getMobileFlipZone(pf, globalPos);
    if (zone === "prev") {
      runMobilePrevFlip(pf, fc, origFlip, globalPos);
      return;
    }
    origFlip(globalPos);
  };

  pf.userMove = function mobileUserMove(pos) {
    if (!this.isUserTouch && this.getSettings().showPageCorners) {
      if (getMobileFlipZone(pf, pos) !== "prev") fc.showCorner(pos);
    } else if (this.isUserTouch) {
      if (touchDistance(this.mousePosition, pos) > 5) {
        this.isUserMove = true;
        if (touchZone === "next") origFold(pos);
      }
    }
  };

  pf.userStop = function mobileUserStop(pos, isSwipe = false) {
    if (this.isUserTouch && !isSwipe && !touchHandled) {
      const zone = getMobileFlipZone(pf, pos) || touchZone;
      if (zone === "prev") {
        this.isUserTouch = false;
        finishFold();
        touchHandled = runMobilePrevFlip(pf, fc, origFlip, pos);
        touchZone = null;
        return;
      }
    }
    touchZone = null;
    origUserStop(pos, isSwipe);
  };

  dist.addEventListener(
    "touchstart",
    (e) => {
      if (e.target?.closest?.("a, button")) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const rect = dist.getBoundingClientRect();
      const pos = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      touchZone = getMobileFlipZone(pf, pos);
      touchHandled = false;
      pf.startUserTouch(pos);
    },
    { passive: true }
  );
}

async function buildPageFlip() {
  const flipbookEl = document.getElementById("flipbook");
  const slot = getBookSlot();
  if (!flipbookEl || !state.pdfObj || !slot) return;

  const my = ++buildSerial;
  const { pdf, pageCount } = state.pdfObj;
  const savedPage = state.pageFlip
    ? state.pageFlip.getCurrentPageIndex()
    : state.currentPageIndex;
  const startPage = Math.max(0, Math.min(pageCount - 1, savedPage));

  destroyPageFlip();
  slot.innerHTML = "";
  slot.classList.remove("is-cover-front", "is-cover-back", "flipbook-slot--first-cover-center");

  const mount = document.createElement("div");
  mount.className = "stf-book-mount";
  slot.appendChild(mount);

  const page1 = await pdf.getPage(1);
  if (my !== buildSerial) return;
  const vp1 = page1.getViewport({ scale: 1 });
  const aspect = vp1.width / vp1.height;

  const rt = getFlipbookRuntime();
  const singlePage = getEffectiveSinglePage();
  state.singlePage = singlePage;

  const availW = Math.max(280, slot.clientWidth - 16);
  const availH = Math.max(320, slot.clientHeight - 8);
  let pageW = singlePage
    ? Math.min(960, Math.floor(availW - 16))
    : Math.min(540, Math.floor((availW - 16) / 2));
  let pageH = Math.floor(pageW / aspect);
  if (pageH > availH) {
    pageH = Math.floor(availH);
    pageW = Math.floor(pageH * aspect);
  }
  pageW = Math.max(120, pageW);
  pageH = Math.max(Math.floor(120 / aspect), Math.floor(pageW / aspect));
  state.basePageWidth = pageW;
  state.pageDisplayWidth = pageW;
  document.body.classList.toggle("is-single-page", singlePage);
  document.body.classList.toggle("is-mobile", isMobileViewport());

  const items = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p % 5 === 0 || p === pageCount) {
      setCatalogLoadingMessage(`Preparing catalog… page ${p} of ${pageCount}`);
    }
    const wrap = document.createElement("div");
    if (p === 1 || p === pageCount) wrap.dataset.density = "hard";

    const inner = document.createElement("div");
    inner.className = "page-inner";
    inner.dataset.pageNumber = String(p);
    inner.style.boxSizing = "border-box";
    inner.style.width = "100%";
    inner.style.height = "100%";
    inner.style.position = "relative";
    inner.style.background = "#fff";
    inner.style.overflow = "hidden";

    try {
      const canvas = await renderPageToCanvas(pdf, p, pageW);
      fitCanvasToPage(canvas);
      inner.appendChild(canvas);
      attachHotspots({ pageNumber: p, container: inner, canvas, editorMode: isHotspotEditorActive() });
    } catch (err) {
      console.warn("Page render failed", p, err);
    }
    wrap.appendChild(inner);
    items.push(wrap);
    if (my !== buildSerial) return;
  }

  if (my !== buildSerial) return;

  const mobile = isMobileViewport();
  const pf = new PageFlip(mount, {
    width: pageW,
    height: pageH,
    size: "stretch",
    minWidth: singlePage ? 2000 : 120,
    maxWidth: singlePage ? 1200 : 1400,
    minHeight: 160,
    maxHeight: 2200,
    maxShadowOpacity: 0.55,
    showCover: true,
    drawShadow: true,
    flippingTime: 880,
    usePortrait: true,
    mobileScrollSupport: false,
    swipeDistance: 30,
    startPage,
    clickEventForward: true,
    useMouseEvents: true,
    showPageCorners: true,
    disableFlipByClick: mobile,
  });

  pf.loadFromHTML(items);
  if (my !== buildSerial) {
    try {
      pf.destroy();
    } catch (_) {
      /* ignore */
    }
    return;
  }
  state.pageFlip = pf;
  installMobileNaturalFlip(pf);

  pf.on("flip", () => {
    state.currentPageIndex = pf.getCurrentPageIndex();
    updateChromeNav();
    highlightThumbnails();
    syncCoverSlotLayout();
    scheduleHotspotSync(flipbookEl);
    mountEditorSurfaces(flipbookEl, getVisible1BasedPages());
  });

  pf.on("changeState", (ev) => {
    if (ev?.data !== "read") {
      getBookSlot()?.classList.remove("flipbook-slot--first-cover-center");
    } else {
      syncCoverSlotLayout();
    }
  });

  pf.on("changeOrientation", () => {
    syncCoverSlotLayout();
  });
  state.currentPageIndex = startPage;

  updateChromeNav();
  highlightThumbnails();
  syncCoverSlotLayout();
  scheduleHotspotSync(flipbookEl);
  mountEditorSurfaces(flipbookEl, getVisible1BasedPages());

  updateZoomChrome();
  updateViewModeToggle();

  if (my !== buildSerial) return;
}

function scheduleResizeRebuild() {
  if (state.resizeTimer) clearTimeout(state.resizeTimer);
  state.resizeTimer = setTimeout(() => {
    state.resizeTimer = null;
    if (state.pdfObj) {
      buildPageFlip();
      if (!isMobileViewport()) renderThumbnails(state.pdfObj.pdf);
    }
  }, 200);
}

function setCatalogLoading(visible) {
  const el = document.getElementById("catalogLoading");
  if (!el) return;
  el.classList.toggle("is-hidden", !visible);
  el.setAttribute("aria-busy", visible ? "true" : "false");
}

function setCatalogLoadingMessage(text) {
  const el = document.querySelector("#catalogLoading .catalog-loading__inner p");
  if (el && text) el.textContent = text;
}

function showCatalogLoadError(message) {
  const el = document.getElementById("catalogLoading");
  if (!el) {
    showError(message);
    return;
  }
  el.classList.remove("is-hidden");
  el.setAttribute("aria-busy", "false");
  const spinner = el.querySelector(".catalog-loading__spinner");
  if (spinner) spinner.hidden = true;
  setCatalogLoadingMessage(message);
}

function applyPublishChrome() {
  const rt = getFlipbookRuntime();
  document.body.classList.toggle("is-publish", rt.publishMode);

  const upload = document.getElementById("uploadControl");
  if (upload) upload.hidden = rt.publishMode;

  const titleEl = document.getElementById("toolbarTitle");
  if (titleEl && rt.publishMode) titleEl.textContent = rt.catalogTitle;

  if (rt.publishMode && rt.catalogTitle) {
    document.title = rt.catalogTitle;
  }
}

function initFlipbookApp() {
  applyPublishChrome();
  resetHotspotsToBundled();
  ensureControls();
  const rt = getFlipbookRuntime();
  if (rt.mode === "b2b-whatsapp") {
    document.body.classList.add("is-b2b");
    mountWhatsAppCartUI();
    mountB2BDemoHints();
    setB2BGoToPage((pageNum) => {
      if (!state.pageFlip) return;
      state.pageFlip.turnToPage(pageNum - 1);
      updateChromeNav();
      highlightThumbnails();
      const flipbookEl = document.getElementById("flipbook");
      scheduleHotspotSync(flipbookEl);
      mountEditorSurfaces(flipbookEl, getVisible1BasedPages());
    });
  }
  const pdfInput = document.getElementById("pdfInput");
  const flipbookEl = document.getElementById("flipbook");
  const pdfName = document.getElementById("pdfName");

  if (flipbookEl && !flipbookEl.querySelector(".flipbook-book-slot")) {
    flipbookEl.innerHTML = `
      <div class="flipbook-stage">
        <div class="flipbook-book-slot"></div>
        <div class="flipbook-edge-ui">
          <button type="button" class="flipbook-edge-zone flipbook-edge-zone--prev" aria-label="Previous page" title="Previous page">
            <span class="flipbook-edge-visual flipbook-edge-visual--prev">
              <span class="flipbook-edge-curl" aria-hidden="true"></span>
              <span class="flipbook-edge-arrow" aria-hidden="true">‹</span>
            </span>
          </button>
          <button type="button" class="flipbook-edge-zone flipbook-edge-zone--next" aria-label="Next page" title="Next page">
            <span class="flipbook-edge-visual flipbook-edge-visual--next">
              <span class="flipbook-edge-curl" aria-hidden="true"></span>
              <span class="flipbook-edge-arrow" aria-hidden="true">›</span>
            </span>
          </button>
        </div>
      </div>
      <div class="flipbook-scrubber" id="flipbookScrubber" hidden role="slider" aria-label="Catalog progress" aria-valuemin="1" aria-valuenow="1" aria-valuemax="1">
        <div class="flipbook-scrubber__track" role="presentation">
          <div class="flipbook-scrubber__fill"></div>
          <button type="button" class="flipbook-scrubber__thumb" aria-label="Drag to jump to another section"></button>
        </div>
      </div>`;
    flipbookEl.dataset.chromeBound = "";
  }

  if (!pdfInput) {
    showError("Missing input#pdfInput");
    return;
  }

  installHotspotEditor({ rerender: () => buildPageFlip() });
  installFlipbookChrome();
  hideZoomUi();
  installViewModeToggle();

  async function loadEditorCatalogEntry(entry) {
    if (!entry?.pdfUrl) return;
    window.FLIPBOOK_CONFIG.hotspotsFile = entry.hotspotsFile || "default";
    resetHotspotsToBundled();
    setCatalogLoading(true);
    const pdfData = await loadPdfFromUrl(entry.pdfUrl, {
      extractText: rt.showDetectedProducts,
    });
    await openPdfData(pdfData, entry.catalogTitle || entry.label);
  }

  if (rt.allowEditor && rt.editorPdfLibrary.length) {
    const initial = resolveInitialEditorCatalog(rt.editorPdfLibrary, rt.defaultPdfUrl);
    installEditorCatalogPicker({
      library: rt.editorPdfLibrary,
      initialId: initial?.id,
      onSelect: loadEditorCatalogEntry,
    });
  }

  document.getElementById("prevBtn")?.addEventListener("click", () => {
    state.pageFlip?.flipPrev("top");
  });
  document.getElementById("nextBtn")?.addEventListener("click", () => {
    state.pageFlip?.flipNext("top");
  });

  document.addEventListener("keydown", (e) => {
    if (!state.pdfObj) return;
    if (e.target && ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      state.pageFlip?.flipPrev("top");
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      state.pageFlip?.flipNext("top");
    }
  });

  window.addEventListener("resize", scheduleResizeRebuild);

  async function openPdfData(pdfData, displayName) {
    uiUpdate([]);
    document.getElementById("shopify-buttons")?.remove();
    document.getElementById("product-summary")?.remove();

    const rt = getFlipbookRuntime();
    if (pdfName) {
      if (rt.mode === "b2b-whatsapp") {
        pdfName.textContent = "Tap products · build your order · WhatsApp";
      } else {
        pdfName.textContent = rt.publishMode
          ? "Tap a product to add to cart"
          : displayName || "Catalog";
      }
    }

    state.pdfObj = pdfData;
    state.zoom = 1;
    updateZoomChrome();

    if (rt.showDetectedProducts) {
      const products = await detectProducts(pdfData || {});
      generateButtons(products || []);
      uiUpdate(products || {});
    }

    if (rt.showDetectedProducts) {
      await renderThumbnails(pdfData.pdf);
    } else {
      await renderThumbnails(pdfData.pdf);
    }
    await buildPageFlip();
    if (!state.pageFlip && state.pdfObj) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await buildPageFlip();
    }
    if (!state.pageFlip) {
      throw new Error("Could not initialize the catalog viewer.");
    }
    setCatalogLoading(false);
  }

  async function processFile(file) {
    try {
      if (!file) {
        showError("No file provided.");
        return;
      }
      setCatalogLoading(true);
      const pdfData = await loadPdf(file);
      await openPdfData(pdfData, file.name);
    } catch (error) {
      console.error("Error loading PDF:", error);
      setCatalogLoading(false);
      showError("Could not load the PDF. Check the console.");
    }
  }

  pdfInput.addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) processFile(f);
  });

  if (rt.defaultPdfUrl) {
    const startEntry =
      rt.allowEditor && rt.editorPdfLibrary.length
        ? resolveInitialEditorCatalog(rt.editorPdfLibrary, rt.defaultPdfUrl)
        : null;
    const startUrl = startEntry?.pdfUrl || rt.defaultPdfUrl;
    if (startEntry) {
      window.FLIPBOOK_CONFIG.hotspotsFile = startEntry.hotspotsFile || "default";
      resetHotspotsToBundled();
    }
    setCatalogLoading(true);
    loadPdfFromUrl(startUrl, { extractText: rt.showDetectedProducts })
      .then((pdfData) =>
        openPdfData(
          pdfData,
          startEntry?.catalogTitle || startEntry?.label || pdfData.displayName
        ).catch((err) => {
          console.error(err);
          showCatalogLoadError(
            "Could not display the catalog. Reload the page (Ctrl+Shift+R)."
          );
        })
      )
      .catch((err) => {
        console.error(err);
        showCatalogLoadError(
          `PDF not found. Make sure the dev server is running (npm run dev:catalogs) and try: ${rt.defaultPdfUrl}`
        );
        const upload = document.getElementById("uploadControl");
        if (upload && !rt.publishMode) upload.hidden = false;
      });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootFlipbookApp);
} else {
  bootFlipbookApp();
}

function bootFlipbookApp() {
  const rt = getFlipbookRuntime();
  const needsAuth = rt.requireAuth === true;
  if (needsAuth) {
    window.startFlipbookApp = initFlipbookApp;
    return;
  }
  initFlipbookApp();
}
