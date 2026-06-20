import { getHotspotsForPage } from "./hotspots-data.js";
import { addToCart, buyNow } from "./shopify-actions.js";
import { getFlipbookRuntime } from "./flipbook-runtime.js";
import { promptAddToOrder } from "./whatsapp-cart-ui.js";

function layoutHotspot(el, overlayW, overlayH) {
  const nx = parseFloat(el.dataset.nx || "0");
  const ny = parseFloat(el.dataset.ny || "0");
  const nw = parseFloat(el.dataset.nw || "0");
  const nh = parseFloat(el.dataset.nh || "0");
  el.style.left = Math.round(nx * overlayW) + "px";
  el.style.top = Math.round(ny * overlayH) + "px";
  el.style.width = Math.round(nw * overlayW) + "px";
  el.style.height = Math.round(nh * overlayH) + "px";
}

/** Alinea el overlay al canvas centrado dentro de .page-inner */
function layoutOverlayToCanvas(overlay, canvas, container) {
  if (!overlay || !canvas || !container) return;
  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const w = canvasRect.width;
  const h = canvasRect.height;
  if (w < 1 || h < 1) return;
  overlay.style.left = Math.round(canvasRect.left - containerRect.left) + "px";
  overlay.style.top = Math.round(canvasRect.top - containerRect.top) + "px";
  overlay.style.width = Math.round(w) + "px";
  overlay.style.height = Math.round(h) + "px";
  overlay.querySelectorAll(".hotspot").forEach((el) => layoutHotspot(el, w, h));
}

let syncTimer = null;

/** Re-sincroniza zonas tras voltear página o animación del flipbook. */
export function scheduleHotspotSync(root) {
  if (!root) return;
  const run = () => syncHotspotOverlays(root);
  run();
  requestAnimationFrame(() => requestAnimationFrame(run));
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(run, 120);
  setTimeout(run, 450);
  setTimeout(run, 950);
}

/** Call after zoom / resize so overlay matches displayed canvas CSS size. */
export function syncHotspotOverlays(root) {
  if (!root) return;
  root.querySelectorAll(".hotspots-overlay").forEach((overlay) => {
    const inner = overlay.parentElement;
    const canvas = inner && inner.querySelector("canvas");
    if (!canvas || !inner) return;
    layoutOverlayToCanvas(overlay, canvas, inner);
  });
}

export function attachHotspots({ pageNumber, container, canvas, editorMode = false }) {
  const list = getHotspotsForPage(pageNumber);
  if (!list.length) return;

  const rt = getFlipbookRuntime();
  const overlay = document.createElement("div");
  overlay.className = "hotspots-overlay";
  overlay.style.position = "absolute";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.pointerEvents = "none";

  const tint =
    rt.hotspotDebug || editorMode
      ? "rgba(255, 165, 0, 0.12)"
      : rt.mode === "b2b-whatsapp"
        ? "rgba(255, 165, 0, 0.1)"
        : "transparent";
  const border =
    rt.hotspotDebug || editorMode
      ? "1px dashed rgba(255, 140, 0, 0.45)"
      : rt.mode === "b2b-whatsapp"
        ? "1px dashed rgba(255, 140, 0, 0.35)"
        : "none";

  for (const h of list) {
    const el = document.createElement("button");
    el.className = "hotspot";
    el.type = "button";
    el.style.position = "absolute";
    el.style.background = tint;
    el.style.border = border;
    el.style.borderRadius = "2px";
    el.style.cursor = "pointer";
    el.style.pointerEvents = editorMode ? "none" : "auto";
    el.style.padding = "0";
    el.title = h.label || "";
    el.setAttribute("aria-label", h.label || "Product link");
    el.dataset.nx = String(h.x);
    el.dataset.ny = String(h.y);
    el.dataset.nw = String(h.w);
    el.dataset.nh = String(h.h);

    if (!editorMode) {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const variantId = h.variantId;
        const quantity = h.quantity || 1;
        const href = h.href || null;
        const rt = getFlipbookRuntime();
        if (h.action === "cart" || (rt.mode === "b2b-whatsapp" && h.action !== "buy" && h.action !== "add")) {
          promptAddToOrder({
            label: h.label,
            codigo: h.codigo,
            presentacion: h.presentacion,
            quantity,
          });
          return;
        }
        if (!href && !variantId) return;
        if (h.action === "add") {
          addToCart({ variantId, quantity, href }).catch(console.error);
        } else if (h.action === "buy") {
          buyNow({ variantId, quantity, href });
        }
      });
    }

    overlay.appendChild(el);
  }

  container.appendChild(overlay);
  layoutOverlayToCanvas(overlay, canvas, container);
}
