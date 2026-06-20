import SHOPIFY_CONFIG from "../config/shopify-config.js";

/**
 * Returns Promise<Array<{page, name, handle, variantId}>>
 * - If SHOPIFY_CONFIG.products has entries: use keyword matching per page.
 * - Otherwise try to extract /products/handles or full URLs from PDF text and fetch product JSON.
 */
export async function detectProducts({ pageTexts = new Map(), fullText = "", pageCount = 0 } = {}) {
  const results = [];

  // 1) If config products exist, do keyword search per page
  const configured = Array.isArray(SHOPIFY_CONFIG.products) && SHOPIFY_CONFIG.products.length > 0;
  if (configured) {
    for (let p = 1; p <= pageCount; p++) {
      const text = (pageTexts.get(p) || "").toLowerCase();
      for (const prod of SHOPIFY_CONFIG.products) {
        const match = (prod.keywords || []).some(k => text.includes(k.toLowerCase()));
        if (match) results.push({ page: p, name: prod.name, handle: prod.handle, variantId: String(prod.variantId) });
      }
    }
    // dedupe by variant+page
    const seen = new Set(); const uniq = [];
    results.forEach(r => {
      const key = `${r.variantId||r.handle}|${r.page}`;
      if (!seen.has(key)) { seen.add(key); uniq.push(r); }
    });
    return uniq;
  }

  // 2) Auto-detect handles/URLs in fullText if no config
  const foundHandles = new Map(); // handle -> Set(pages)
  const urlRegex = /https?:\/\/[^\s"'()<>]+\/products\/([a-z0-9\-_%]+)/ig;
  const relRegex = /\/products\/([a-z0-9\-_%]+)/ig;
  let m;
  while ((m = urlRegex.exec(fullText)) !== null) foundHandles.set(decodeURIComponent(m[1]).toLowerCase(), new Set());
  while ((m = relRegex.exec(fullText)) !== null) foundHandles.set(decodeURIComponent(m[1]).toLowerCase(), new Set());

  // map pages where handle text appears (loose match)
  for (let p = 1; p <= pageCount; p++) {
    const text = (pageTexts.get(p) || "").toLowerCase();
    for (const handle of foundHandles.keys()) {
      if (text.includes(handle) || text.includes(handle.replace(/-/g, ' '))) foundHandles.get(handle).add(p);
    }
  }

  // fetch product json for each handle found
  const store = SHOPIFY_CONFIG.store || window.location.host;
  for (const [handle, pagesSet] of foundHandles.entries()) {
    try {
      const resp = await fetch(`https://${store}/products/${encodeURIComponent(handle)}.js`);
      if (!resp.ok) continue;
      const product = await resp.json();
      const variantId = product.variants && product.variants[0] && String(product.variants[0].id) || null;
      const name = product.title || handle;
      const pages = pagesSet.size ? Array.from(pagesSet) : [1];
      pages.forEach(p => results.push({ page: p, name, handle, variantId }));
    } catch (err) {
      // ignore
    }
  }

  // dedupe
  const seen2 = new Set(); const uniq2 = [];
  results.forEach(r => {
    const key = `${r.variantId||r.handle}|${r.page}`;
    if (!seen2.has(key)) { seen2.add(key); uniq2.push(r); }
  });
  return uniq2;
}