import { getFlipbookRuntime } from "./flipbook-runtime.js";

export function cartPermalinkUrl(storeOrigin, variantId, quantity) {
  const base = String(storeOrigin).replace(/\/$/, "");
  return `${base}/cart/${variantId}:${quantity}`;
}

/**
 * Add line via Cart Ajax API (only works when this app is served on the **store domain** — same-site cookies).
 */
export async function addToCartAjax({ variantId, quantity = 1 }) {
  const { storeOrigin } = getFlipbookRuntime();
  const url = `${storeOrigin}/cart/add.js`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: JSON.stringify({ items: [{ id: Number(variantId), quantity: Number(quantity) || 1 }] }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`cart/add.js failed: ${res.status} ${t}`);
  }
  return res.json();
}

function navigateTo(url, mode) {
  if (mode === "tab") window.open(url, "_blank", "noopener,noreferrer");
  else window.location.assign(url);
}

/**
 * Hotspot "add": merge-friendly flow when possible (Ajax same-origin), otherwise Shopify cart permalink.
 */
export async function addToCart({ variantId, quantity = 1, href }) {
  const { storeOrigin, addMode, navigate } = getFlipbookRuntime();
  if (href) {
    navigateTo(href, navigate);
    return { ok: true, via: "href" };
  }
  if (!variantId) return { ok: false, via: "none" };
  if (addMode === "ajax") {
    try {
      await addToCartAjax({ variantId, quantity });
      return { ok: true, via: "ajax" };
    } catch (e) {
      console.warn("[flipbook] Ajax add failed, falling back to permalink", e);
    }
  }
  const url = cartPermalinkUrl(storeOrigin, variantId, quantity);
  navigateTo(url, navigate);
  return { ok: true, via: "permalink" };
}

/** Hotspot "buy": go straight to cart with that variant (same as add for permalink). */
export function buyNow({ variantId, quantity = 1, href }) {
  const { storeOrigin, navigate } = getFlipbookRuntime();
  if (href) {
    navigateTo(href, navigate);
    return;
  }
  if (!variantId) return;
  navigateTo(cartPermalinkUrl(storeOrigin, variantId, quantity), navigate);
}
