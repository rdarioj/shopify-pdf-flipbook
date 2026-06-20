const pdfjsLib = window.pdfjsLib;

export async function loadPdfFromBuffer(buffer, displayName = "catalogo.pdf", { extractText = true } = {}) {
  if (!buffer) throw new Error("No PDF data");
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pageTexts = new Map();
  let fullText = "";

  if (extractText) {
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const textItems = content.items.map((it) => it.str || "").join(" ");
      pageTexts.set(i, textItems);
      fullText += `\n\n--- PAGE ${i} ---\n` + textItems;
    }
  }

  return { pdf, pageTexts, fullText, pageCount, displayName };
}

/** @param {string} url - ruta relativa (./catalogo.pdf) o URL absoluta */
export async function loadPdfFromUrl(url, { extractText = true } = {}) {
  const fetchUrl = resolvePdfFetchUrl(url);
  const res = await fetch(fetchUrl, { cache: "default" });
  if (!res.ok) throw new Error(`No se pudo cargar el PDF (${res.status})`);
  const buffer = await res.arrayBuffer();
  const name = url.split("/").pop()?.split("?")[0] || "catalogo.pdf";
  return loadPdfFromBuffer(buffer, name, { extractText });
}

function resolvePdfFetchUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  const cleaned = String(url).replace(/^\.\//, "");
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(cleaned, `${window.location.origin}/`).href;
  }
  return cleaned;
}

export async function loadPdf(file) {
  if (!file) throw new Error("No file provided");
  const buffer = await file.arrayBuffer();
  const data = await loadPdfFromBuffer(buffer, file.name || "document.pdf");
  return { pdf: data.pdf, pageTexts: data.pageTexts, fullText: data.fullText, pageCount: data.pageCount };
}

/** Render de miniatura: escala exacta al ancho del sidebar (sin piso 0.6). */
export async function renderThumbToCanvas(pdf, pageNumber, maxWidth = 120) {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2, maxWidth / baseViewport.width);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  canvas.style.maxWidth = "100%";
  canvas.dataset.pageNumber = String(pageNumber);

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

/** Ratio HD para texto nítido (igual que producción). */
export function getRenderPixelRatio(zoom = 1) {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return Math.min(5, Math.max(2, 1.75 * Math.min(3, dpr)) * Math.max(1, zoom));
}

function resolvePageRenderOptions(maxWidth) {
  if (typeof maxWidth === "number") {
    return { displayWidth: maxWidth, zoom: 1, pixelRatio: getRenderPixelRatio(1) };
  }
  const displayWidth = maxWidth.displayWidth ?? maxWidth.maxWidth ?? 800;
  const zoom = maxWidth.zoom ?? 1;
  const pixelRatio = maxWidth.pixelRatio ?? getRenderPixelRatio(zoom);
  return { displayWidth, zoom, pixelRatio };
}

/** Render HD: bitmap a mayor resolución, tamaño CSS al ancho de página. */
export async function renderPageToCanvas(pdf, pageNumber, maxWidth = 800) {
  const { displayWidth, pixelRatio } = resolvePageRenderOptions(maxWidth);
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const displayHeight = displayWidth * (baseViewport.height / baseViewport.width);
  const renderScale = (displayWidth * pixelRatio) / baseViewport.width;
  const viewport = page.getViewport({ scale: renderScale });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.display = "block";
  canvas.style.width = `${Math.round(displayWidth)}px`;
  canvas.style.height = `${Math.round(displayHeight)}px`;
  canvas.style.maxWidth = "none";
  canvas.style.maxHeight = "none";
  canvas.dataset.displayWidth = String(Math.round(displayWidth));
  canvas.dataset.displayHeight = String(Math.round(displayHeight));
  canvas.dataset.pageNumber = String(pageNumber);
  canvas.dataset.renderScale = String(pixelRatio);

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}
