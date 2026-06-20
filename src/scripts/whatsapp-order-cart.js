/** In-memory B2B order list → WhatsApp message (no checkout). */

const items = [];

function slug(line) {
  return `${line.codigo || ""}|${line.label || ""}`;
}

export function getOrderItems() {
  return items.map((row) => ({ ...row }));
}

export function getOrderCount() {
  return items.reduce((n, row) => n + (Number(row.quantity) || 1), 0);
}

export function clearOrder() {
  items.length = 0;
}

export function removeOrderItem(id) {
  const i = items.findIndex((row) => row.id === id);
  if (i >= 0) items.splice(i, 1);
}

export function addOrderItem({ label, codigo, presentacion, quantity = 1 }) {
  const qty = Math.max(1, Number(quantity) || 1);
  const id = slug({ codigo, label });
  const existing = items.find((row) => row.id === id);
  if (existing) {
    existing.quantity += qty;
    return existing;
  }
  const row = {
    id,
    label: String(label || "Producto").trim(),
    codigo: codigo ? String(codigo).trim() : "",
    presentacion: presentacion ? String(presentacion).trim() : "",
    quantity: qty,
  };
  items.push(row);
  return row;
}

export function buildWhatsAppMessage({ intro, businessName } = {}) {
  const head =
    intro ||
    `Hola${businessName ? ` ${businessName}` : ""}, quiero pedir:`;
  if (!items.length) return head;

  const lines = items.map((row) => {
    const parts = [row.label];
    if (row.codigo || row.presentacion) {
      const cod = row.codigo ? `COD. ${row.codigo}` : "";
      const pres = row.presentacion ? ` - ${row.presentacion}` : "";
      parts.push(`${cod}${pres}`.trim());
    }
    parts.push(`Cant: ${row.quantity}`);
    return parts.join("\n");
  });

  return `${head}\n\n${lines.join("\n\n")}\n\nGracias.`;
}

export function whatsAppUrl(phone, text) {
  const digits = String(phone || "").replace(/\D/g, "");
  const q = encodeURIComponent(text || "");
  if (!digits) return `https://wa.me/?text=${q}`;
  return `https://wa.me/${digits}?text=${q}`;
}

export function openWhatsAppOrder(config = {}) {
  const text = buildWhatsAppMessage(config);
  const url = whatsAppUrl(config.whatsappPhone, text);
  window.open(url, "_blank", "noopener,noreferrer");
  return url;
}
