import SHOPIFY_CONFIG from "../config/shopify-config.js";

const els = {
  pdfInput: document.getElementById("pdfInput"),
  productButtons: document.getElementById("productButtons"),
  message: document.getElementById("message"),
};

function displayMessage(msg) {
  els.message.textContent = msg;
}

function clearProductButtons() {
  els.productButtons.innerHTML = '';
}

function renderProductButtons(products) {
  clearProductButtons();
  
  if (products.length === 0) {
    displayMessage("No products found in the PDF.");
    return;
  }

  products.forEach(product => {
    const addToCartBtn = document.createElement("button");
    addToCartBtn.textContent = "Add to Cart";
    addToCartBtn.className = "btn-add-to-cart";
    addToCartBtn.onclick = () => addToCart(product.handle);

    const checkoutBtn = document.createElement("button");
    checkoutBtn.textContent = "Go to Checkout";
    checkoutBtn.className = "btn-go-to-checkout";
    checkoutBtn.onclick = () => goToCheckout(product.handle);

    els.productButtons.appendChild(addToCartBtn);
    els.productButtons.appendChild(checkoutBtn);
  });
}

function addToCart(handle) {
  const cartUrl = `https://racketcentral.com/cart/add?id=${handle}:1`;
  window.open(cartUrl, "_blank");
}

function goToCheckout(handle) {
  const checkoutUrl = `https://racketcentral.com/cart`;
  window.open(checkoutUrl, "_blank");
}

export function showError(msg) {
  let el = document.getElementById('app-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-error';
    el.style.position = 'fixed';
    el.style.left = '20px';
    el.style.bottom = '20px';
    el.style.padding = '10px 14px';
    el.style.background = '#ffdddd';
    el.style.color = '#800';
    el.style.border = '1px solid #f5c2c2';
    el.style.borderRadius = '6px';
    document.body.appendChild(el);
  }
  el.textContent = `Error: ${msg}`;
  setTimeout(() => el.remove(), 5000);
}

export function updateUI(products = []) {
  if (!products || products.length === 0) {
    document.getElementById("product-summary")?.remove();
    return;
  }
  let el = document.getElementById("product-summary");
  if (!el) {
    el = document.createElement("div");
    el.id = "product-summary";
    el.style.position = "fixed";
    el.style.left = "12px";
    el.style.top = "64px";
    el.style.background = "rgba(0,0,0,0.75)";
    el.style.color = "white";
    el.style.padding = "8px 10px";
    el.style.borderRadius = "8px";
    el.style.zIndex = "9999";
    el.style.fontSize = "12px";
    el.style.maxWidth = "260px";
    document.body.appendChild(el);
  }
  el.textContent = `Detectados ${products.length} producto(s) · ${SHOPIFY_CONFIG.store}`;
}

export { renderProductButtons, displayMessage };