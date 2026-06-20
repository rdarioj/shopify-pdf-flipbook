/** Barra de ayuda + saltos rápidos a páginas con productos demo (TAP). */

const DEMO_PAGES = [
  { page: 26, label: "Pág. 26 · Aceitunas" },
  { page: 27, label: "Pág. 27 · Salsas" },
  { page: 29, label: "Pág. 29 · Aceites" },
];

let goToPageFn = null;

export function setB2BGoToPage(handler) {
  goToPageFn = handler;
}

export function mountB2BDemoHints() {
  if (document.getElementById("b2bDemoHints")) return;

  const bar = document.createElement("div");
  bar.id = "b2bDemoHints";
  bar.className = "b2b-demo-hints";
  bar.innerHTML = `
    <p class="b2b-demo-hints__text">
      <strong>Pedido WhatsApp:</strong> andá a una página demo y tocá la zona naranja sobre el producto.
    </p>
    <div class="b2b-demo-hints__actions"></div>`;

  const actions = bar.querySelector(".b2b-demo-hints__actions");
  for (const item of DEMO_PAGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "b2b-demo-hints__jump";
    btn.textContent = item.label;
    btn.addEventListener("click", () => {
      if (goToPageFn) goToPageFn(item.page);
    });
    actions.appendChild(btn);
  }

  document.body.appendChild(bar);
}
