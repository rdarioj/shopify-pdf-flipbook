import {
  addOrderItem,
  clearOrder,
  getOrderCount,
  getOrderItems,
  openWhatsAppOrder,
  removeOrderItem,
} from "./whatsapp-order-cart.js";
import { getFlipbookRuntime } from "./flipbook-runtime.js";

let rootEl = null;
let qtyModalEl = null;
let onChangeCb = null;

function formatCount(n) {
  return n === 1 ? "1 producto" : `${n} productos`;
}

function renderDrawerList() {
  const list = rootEl?.querySelector(".wa-cart__list");
  if (!list) return;
  const rows = getOrderItems();
  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = '<p class="wa-cart__empty">Tocá productos en el catálogo para armar tu pedido.</p>';
    return;
  }
  for (const row of rows) {
    const li = document.createElement("li");
    li.className = "wa-cart__item";
    const meta = [row.codigo ? `COD. ${row.codigo}` : "", row.presentacion]
      .filter(Boolean)
      .join(" · ");
    li.innerHTML = `
      <div class="wa-cart__item-main">
        <strong>${row.label}</strong>
        ${meta ? `<span class="wa-cart__item-meta">${meta}</span>` : ""}
        <span class="wa-cart__item-qty">Cant: ${row.quantity}</span>
      </div>
      <button type="button" class="wa-cart__remove" aria-label="Quitar">×</button>`;
    li.querySelector(".wa-cart__remove").addEventListener("click", () => {
      removeOrderItem(row.id);
      syncChrome();
    });
    list.appendChild(li);
  }
}

function syncChrome() {
  const count = getOrderCount();
  const badge = rootEl?.querySelector(".wa-cart__badge");
  const sendBtn = rootEl?.querySelector(".wa-cart__send");
  const toggleBtn = rootEl?.querySelector(".wa-cart__toggle");
  if (badge) badge.textContent = String(count);
  if (sendBtn) sendBtn.disabled = count === 0;
  if (toggleBtn) toggleBtn.textContent = count ? `Ver pedido (${formatCount(count)})` : "Ver pedido";
  renderDrawerList();
  onChangeCb?.(count);
}

function closeQtyModal() {
  if (!qtyModalEl) return;
  qtyModalEl.classList.add("is-hidden");
  qtyModalEl.setAttribute("aria-hidden", "true");
}

function openQtyModal({ label, codigo, presentacion, defaultQty = 1 }) {
  if (!qtyModalEl) return;
  const drawer = rootEl?.querySelector(".wa-cart__drawer");
  if (drawer) drawer.hidden = true;
  qtyModalEl.classList.remove("is-hidden");
  qtyModalEl.setAttribute("aria-hidden", "false");
  const title = qtyModalEl.querySelector(".wa-qty__title");
  const input = qtyModalEl.querySelector(".wa-qty__input");
  const meta = qtyModalEl.querySelector(".wa-qty__meta");
  if (title) title.textContent = label || "Agregar al pedido";
  if (meta) {
    const bits = [codigo ? `COD. ${codigo}` : "", presentacion].filter(Boolean);
    meta.textContent = bits.join(" · ");
    meta.hidden = !bits.length;
  }
  if (input) {
    input.value = String(defaultQty);
    input.focus();
    input.select();
  }
  qtyModalEl.dataset.pending = JSON.stringify({ label, codigo, presentacion });
}

function confirmQtyModal() {
  if (!qtyModalEl) return;
  const input = qtyModalEl.querySelector(".wa-qty__input");
  const qty = Math.max(1, Number(input?.value) || 1);
  let payload = {};
  try {
    payload = JSON.parse(qtyModalEl.dataset.pending || "{}");
  } catch (_) {
    /* ignore */
  }
  addOrderItem({ ...payload, quantity: qty });
  closeQtyModal();
  syncChrome();
  rootEl?.classList.add("wa-cart--pulse");
  window.setTimeout(() => rootEl?.classList.remove("wa-cart--pulse"), 400);
}

export function promptAddToOrder(hotspot) {
  openQtyModal({
    label: hotspot.label,
    codigo: hotspot.codigo,
    presentacion: hotspot.presentacion,
    defaultQty: hotspot.quantity || 1,
  });
}

export function mountWhatsAppCartUI({ onChange } = {}) {
  onChangeCb = onChange;
  if (rootEl) {
    syncChrome();
    return rootEl;
  }

  document.querySelectorAll(".wa-qty").forEach((el) => el.remove());
  document.querySelectorAll(".wa-cart").forEach((el) => el.remove());

  rootEl = document.createElement("aside");
  rootEl.className = "wa-cart";
  rootEl.innerHTML = `
    <div class="wa-cart__bar">
      <button type="button" class="wa-cart__toggle">Ver pedido</button>
      <span class="wa-cart__badge" aria-live="polite">0</span>
      <button type="button" class="wa-cart__send" disabled>Enviar pedido por WhatsApp</button>
    </div>
    <div class="wa-cart__drawer" hidden>
      <header class="wa-cart__drawer-head">
        <h2>Tu pedido</h2>
        <button type="button" class="wa-cart__close" aria-label="Cerrar">×</button>
      </header>
      <ul class="wa-cart__list"></ul>
      <footer class="wa-cart__drawer-foot">
        <button type="button" class="wa-cart__clear">Vaciar</button>
        <button type="button" class="wa-cart__send wa-cart__send--drawer" disabled>Enviar por WhatsApp</button>
      </footer>
    </div>`;

  qtyModalEl = document.createElement("div");
  qtyModalEl.className = "wa-qty is-hidden";
  qtyModalEl.setAttribute("aria-hidden", "true");
  qtyModalEl.innerHTML = `
    <div class="wa-qty__backdrop" data-close></div>
    <div class="wa-qty__panel" role="dialog" aria-modal="true" aria-labelledby="waQtyTitle">
      <h3 id="waQtyTitle" class="wa-qty__title">Agregar al pedido</h3>
      <p class="wa-qty__meta"></p>
      <label class="wa-qty__label">Cantidad
        <input class="wa-qty__input" type="number" min="1" step="1" value="1" />
      </label>
      <div class="wa-qty__actions">
        <button type="button" class="wa-qty__cancel" data-close>Cancelar</button>
        <button type="button" class="wa-qty__ok">Agregar</button>
      </div>
    </div>`;

  document.body.appendChild(rootEl);
  document.body.appendChild(qtyModalEl);

  const drawer = rootEl.querySelector(".wa-cart__drawer");
  const toggle = () => {
    if (!drawer) return;
    drawer.hidden = !drawer.hidden;
    if (!drawer.hidden) renderDrawerList();
  };

  rootEl.querySelector(".wa-cart__toggle")?.addEventListener("click", toggle);
  rootEl.querySelector(".wa-cart__close")?.addEventListener("click", () => {
    if (drawer) drawer.hidden = true;
  });

  const send = () => {
    const rt = getFlipbookRuntime();
    openWhatsAppOrder({
      whatsappPhone: rt.whatsappPhone,
      businessName: rt.whatsappBusinessName,
      intro: rt.whatsappIntro,
    });
  };

  rootEl.querySelectorAll(".wa-cart__send").forEach((btn) => btn.addEventListener("click", send));
  rootEl.querySelector(".wa-cart__clear")?.addEventListener("click", () => {
    clearOrder();
    syncChrome();
  });

  qtyModalEl.querySelector(".wa-qty__ok")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    confirmQtyModal();
  });
  qtyModalEl.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeQtyModal();
    });
  });
  qtyModalEl.querySelector(".wa-qty__input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      confirmQtyModal();
    }
    if (e.key === "Escape") closeQtyModal();
  });

  syncChrome();
  return rootEl;
}
