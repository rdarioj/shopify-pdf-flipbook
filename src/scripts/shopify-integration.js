import SHOPIFY_CONFIG from "../config/shopify-config.js";

function createButton(label, onClick) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.className = 'shopify-action';
  btn.style.margin = '6px';
  btn.style.padding = '8px 12px';
  btn.style.borderRadius = '6px';
  btn.style.border = 'none';
  btn.style.cursor = 'pointer';
  btn.addEventListener('click', onClick);
  return btn;
}

function showToast(msg, ok = true) {
  let t = document.getElementById('shopify-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'shopify-toast';
    t.style.position = 'fixed';
    t.style.right = '20px';
    t.style.bottom = '20px';
    t.style.padding = '10px 14px';
    t.style.borderRadius = '6px';
    t.style.zIndex = '10000';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = ok ? 'rgba(0,128,0,0.9)' : 'rgba(200,0,0,0.95)';
  t.style.color = '#fff';
  setTimeout(() => t.remove(), 3000);
}

export function openProductPage(handle) {
  const url = `https://${SHOPIFY_CONFIG.store}/products/${encodeURIComponent(handle)}`;
  window.open(url, '_blank');
}

export function buyNowForVariant(variantId) {
  const url = `https://${SHOPIFY_CONFIG.store}/cart/${variantId}:1?checkout`;
  window.open(url, '_blank');
}

export function generateButtons(products) {
  let container = document.getElementById('shopify-buttons');
  if (container) container.remove();

  container = document.createElement('div');
  container.id = 'shopify-buttons';
  container.style.position = 'fixed';
  container.style.right = '20px';
  container.style.top = '80px';
  container.style.zIndex = '9999';
  container.style.maxWidth = '360px';
  container.style.background = 'rgba(255,255,255,0.98)';
  container.style.padding = '12px';
  container.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
  container.style.borderRadius = '8px';
  container.innerHTML = '<strong>Detected products</strong>';

  products.forEach(prod => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.marginTop = '8px';

    const label = document.createElement('div');
    label.textContent = `${prod.name} (page ${prod.page})`;
    label.style.fontSize = '13px';
    label.style.flex = '1';
    row.appendChild(label);

    const addBtn = createButton('Add to cart', () => {
      // Opens product page (CORS blocks direct cart add from localhost)
      openProductPage(prod.handle);
      showToast('Opening product page');
    });
    addBtn.style.background = '#007bff';
    addBtn.style.color = 'white';
    row.appendChild(addBtn);

    const buyBtn = createButton('Buy now', () => buyNowForVariant(prod.variantId));
    buyBtn.style.background = '#28a745';
    buyBtn.style.color = 'white';
    row.appendChild(buyBtn);

    container.appendChild(row);
  });

  document.body.appendChild(container);
}