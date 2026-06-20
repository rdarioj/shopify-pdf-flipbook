#!/usr/bin/env python3
"""
Rellena bloques vacíos del template RC con imágenes Shopify + genera hotspots.

Entrada:
  - public/catalogo-rc-template.pdf (template pelado)
  - src/config/rc-template-test-from-abril.csv (o --csv)

Salida:
  - public/catalogo-rc-template-filled.pdf
  - src/config/hotspots-rc-template.json
  - scripts/_output/fill-rc-template-report.json

Uso:
  python scripts/fill-rc-template-from-csv.py
  python scripts/fill-rc-template-from-csv.py --pages 2,3   # piloto parcial
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_PDF = ROOT / "public" / "catalogo-rc-template.pdf"
OUT_PDF = ROOT / "public" / "catalogo-rc-template-filled.pdf"
DEFAULT_CSV = ROOT / "src" / "config" / "rc-template-padel-2026.csv"
OUT_HOTSPOTS = ROOT / "src" / "config" / "hotspots-rc-template.json"
OUT_REPORT = ROOT / "scripts" / "_output" / "fill-rc-template-report.json"

STORE = "racketcentral.com"
EMPTY_STROKE = (0.945, 0.949, 0.949)
STROKE_TOL = 0.02
MIN_SLOT_W = 150
MIN_SLOT_H = 100
IMAGE_PAD_TOP = 0.04
IMAGE_PAD_BOTTOM = 0.18
IMAGE_PAD_LEFT = 0.15
IMAGE_PAD_RIGHT = -0.05
CARD_BG = (1, 1, 1)
FEATURED_BG = (0.776, 0.831, 0.125)
NAME_PLACEHOLDERS = {"nombre", "nor", "nombre destacado"}
PRICE_PLACEHOLDER_PREFIX = "$000"
BADGE_TEXT_MARKERS = ("by agust", "agustín tapia", "agustin tapia")
MIN_NAME_FONT = 9.0
MIN_PRICE_FONT = 9.0
NAME_COL_RATIO = 0.44
NAME_MAX_LINES = 3


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "rc-catalog-filler/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "rc-catalog-filler/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def is_empty_slot(drawing: dict) -> bool:
    if drawing.get("fill"):
        return False
    color = drawing.get("color")
    if not color:
        return False
    return all(abs(color[i] - EMPTY_STROKE[i]) < STROKE_TOL for i in range(3))


def detect_page_slots(page: fitz.Page) -> list[dict]:
    pw, ph = page.rect.width, page.rect.height
    slots: list[dict] = []
    for d in page.get_drawings():
        if not is_empty_slot(d):
            continue
        r = d["rect"]
        if r.width < MIN_SLOT_W or r.height < MIN_SLOT_H:
            continue
        slots.append(
            {
                "rect": fitz.Rect(r),
                "x": round(r.x0 / pw, 4),
                "y": round(r.y0 / ph, 4),
                "w": round(r.width / pw, 4),
                "h": round(r.height / ph, 4),
            }
        )
    slots.sort(key=lambda s: (s["rect"].y0, s["rect"].x0))
    for i, s in enumerate(slots, 1):
        s["slot"] = i
    return slots


def detect_featured_slots(page: fitz.Page) -> list[dict]:
    pw, ph = page.rect.width, page.rect.height
    slots: list[dict] = []
    for d in page.get_drawings():
        fill = d.get("fill")
        if not fill:
            continue
        if not (fill[0] > 0.65 and fill[1] > 0.75 and fill[2] < 0.25):
            continue
        r = d["rect"]
        if r.width < 140 or r.height < 180:
            continue
        slots.append(
            {
                "rect": fitz.Rect(r),
                "x": round(r.x0 / pw, 4),
                "y": round(r.y0 / ph, 4),
                "w": round(r.width / pw, 4),
                "h": round(r.height / ph, 4),
                "featured": True,
            }
        )
    slots.sort(key=lambda s: (s["rect"].y0, s["rect"].x0))
    return slots


def load_csv_rows(path: Path) -> dict[tuple[int, int], dict]:
    rows: dict[tuple[int, int], dict] = {}
    with path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            page = int(row["page"])
            slot = int(row["slot"])
            rows[(page, slot)] = row
    return rows


def resolve_product(row: dict) -> tuple[str, str, str, str, str]:
    """Returns image_url, variant_id, link_url, display_title, price_label."""
    variant_id = (row.get("variant_id") or "").strip()
    href = (row.get("href") or "").strip()
    handle = (row.get("handle") or "").strip()
    title = (row.get("title") or row.get("label") or "").strip()
    short_title = (row.get("short_title") or title).strip()
    price = (row.get("price") or "").strip()
    image_url = (row.get("image") or row.get("image_url") or "").strip()
    if image_url.startswith("//"):
        image_url = "https:" + image_url

    if handle and (not image_url or not variant_id or not title):
        try:
            product = fetch_json(f"https://{STORE}/products/{handle}.js")
            if not title:
                title = product.get("title") or handle
            if not short_title:
                short_title = title
            if not variant_id and product.get("variants"):
                variant_id = str(product["variants"][0]["id"])
            if not price and product.get("variants"):
                p = product["variants"][0].get("price")
                if p:
                    price = f"${float(p):.0f}" if float(p) == int(float(p)) else f"${float(p):.2f}"
            if not href:
                href = f"https://{STORE}/products/{handle}"
            if not image_url:
                images = product.get("images") or []
                if images:
                    image_url = images[0]
                    if image_url.startswith("//"):
                        image_url = "https:" + image_url
        except (urllib.error.URLError, json.JSONDecodeError, KeyError) as err:
            raise RuntimeError(f"Shopify fetch failed for {handle}: {err}") from err

    cart_url = f"https://{STORE}/cart/{variant_id}:1" if variant_id else href
    return image_url, variant_id, cart_url or href, short_title or title or handle, price


def _slot_image_zone(slot: fitz.Rect) -> fitz.Rect:
    """Zona derecha de la tarjeta para la paleta (como el diseño Figma)."""
    return fitz.Rect(
        slot.x0 + slot.width * IMAGE_PAD_LEFT,
        slot.y0 + slot.height * IMAGE_PAD_TOP,
        slot.x1 - slot.width * IMAGE_PAD_RIGHT,
        slot.y1 - slot.height * IMAGE_PAD_BOTTOM,
    )


def clear_white_slot_images(page: fitz.Page, slot: fitz.Rect) -> None:
    """Quita siluetas del template solo dentro de la tarjeta indicada."""
    zone = _slot_image_zone(slot)
    touched = False
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 1:
            continue
        bbox = fitz.Rect(block["bbox"])
        if bbox.width > page.rect.width * 0.45:
            continue
        center = fitz.Point((bbox.x0 + bbox.x1) / 2, (bbox.y0 + bbox.y1) / 2)
        if not slot.contains(center):
            continue
        if (bbox & zone).get_area() < 18:
            continue
        page.add_redact_annot(bbox + (-1, -1, 1, 1), fill=CARD_BG)
        touched = True
    if touched:
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE)


def _featured_image_zone(slot: fitz.Rect) -> fitz.Rect:
    """Zona derecha de la tarjeta destacada (texto/logo a la izquierda)."""
    return fitz.Rect(
        slot.x0 + slot.width * 0.38,
        slot.y0 + slot.height * 0.10,
        slot.x1 - slot.width * 0.02,
        slot.y1 - slot.height * 0.26,
    )


def clear_featured_placeholder(page: fitz.Page, slot: fitz.Rect) -> None:
    """Limpia la silueta del template en la tarjeta verde (sin tocar el badge inferior)."""
    image_zone = _featured_image_zone(slot)
    badge_zone = featured_badge_zone(slot)
    touched = False
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 1:
            continue
        bbox = fitz.Rect(block["bbox"])
        if (bbox & image_zone).get_area() < 24:
            continue
        redact = bbox & image_zone
        if (redact & badge_zone).get_area() > 4:
            redact = fitz.Rect(redact.x0, redact.y0, redact.x1, badge_zone.y0 - 2)
        if redact.height < 8:
            continue
        page.add_redact_annot(redact + (-2, -2, 2, 2), fill=FEATURED_BG)
        touched = True
    if touched:
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE)


def fit_image_rect(slot: fitz.Rect, img_w: int, img_h: int) -> fitz.Rect:
    """Paleta grande alineada a la derecha; logo arriba-izq y nombre abajo-izq libres."""
    inner = _slot_image_zone(slot)
    if inner.width <= 0 or inner.height <= 0:
        return inner
    slot_ar = inner.width / inner.height
    img_ar = img_w / max(img_h, 1)
    if img_ar > slot_ar:
        h = inner.height
        w = h * img_ar
        x0 = inner.x1 - w
        y0 = inner.y0
    else:
        h = inner.height
        w = h * img_ar
        x0 = inner.x1 - w
        y0 = inner.y0
    return fitz.Rect(x0, y0, x0 + w, y0 + h)


def fit_featured_image_rect(slot: fitz.Rect, img_w: int, img_h: int) -> fitz.Rect:
    """Paleta grande alineada a la derecha; nombre y logo quedan libres a la izquierda."""
    inner = _featured_image_zone(slot)
    if inner.width <= 0 or inner.height <= 0:
        return inner
    slot_ar = inner.width / inner.height
    img_ar = img_w / max(img_h, 1)
    if img_ar > slot_ar:
        h = inner.height
        w = h * img_ar
        x0 = inner.x1 - w
        y0 = inner.y0
    else:
        h = inner.height
        w = h * img_ar
        x0 = inner.x1 - w
        y0 = inner.y0
    if x0 < inner.x0:
        x0 = inner.x0
        w = inner.width
        h = w / img_ar
        y0 = inner.y0 + (inner.height - h) / 2
    return fitz.Rect(x0, y0, x0 + w, y0 + h)


def _span_rect(span: dict) -> fitz.Rect:
    return fitz.Rect(span["bbox"])


def find_text_placeholders(page: fitz.Page) -> tuple[list[dict], list[dict]]:
    names: list[dict] = []
    prices: list[dict] = []
    data = page.get_text("dict")
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = (span.get("text") or "").strip()
                if not text:
                    continue
                low = text.lower()
                rect = _span_rect(span)
                if low in NAME_PLACEHOLDERS or low.startswith("nombre"):
                    names.append({"rect": rect, "size": span.get("size", 12), "featured": "destacado" in low})
                elif low.startswith(PRICE_PLACEHOLDER_PREFIX) or low == "$000.000":
                    prices.append({"rect": rect, "size": span.get("size", 10)})
    names.sort(key=lambda s: (s["rect"].y0, s["rect"].x0))
    prices.sort(key=lambda s: (s["rect"].y0, s["rect"].x0))
    return names, prices


def _is_badge_text(text: str) -> bool:
    low = text.lower().strip()
    return any(m in low for m in BADGE_TEXT_MARKERS)


def expand_label_rect(slot_rect: fitz.Rect, ph_rect: fitz.Rect, *, line: str = "name") -> fitz.Rect:
    """Columna izquierda de la tarjeta (no invade la zona de la paleta)."""
    x0 = slot_rect.x0 + 8
    x1 = slot_rect.x0 + slot_rect.width * NAME_COL_RATIO
    if line == "name":
        return fitz.Rect(x0, ph_rect.y0 - 2, x1, ph_rect.y1 + 1)
    return fitz.Rect(x0, ph_rect.y0 - 1, x1, ph_rect.y1 + 2)


def slot_name_box(slot_rect: fitz.Rect, price_ph: dict, name_ph: dict) -> fitz.Rect:
    """Área multilínea en columna izquierda, desde media tarjeta hasta el precio."""
    x0 = slot_rect.x0 + 8
    x1 = slot_rect.x0 + slot_rect.width * NAME_COL_RATIO
    y1 = price_ph["rect"].y0 - 4
    y0 = slot_rect.y0 + slot_rect.height * 0.14
    if y1 - y0 < 28:
        y0 = y1 - 40
    y0 = max(y0, slot_rect.y0 + 6)
    return fitz.Rect(x0, y0, x1, y1)


def find_badge_in_featured(page: fitz.Page, featured_rect: fitz.Rect) -> fitz.Rect | None:
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = (span.get("text") or "").strip()
                if not text or not _is_badge_text(text):
                    continue
                rect = _span_rect(span)
                center = fitz.Point((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)
                if featured_rect.contains(center):
                    return rect
    return None


def featured_top_name_box(featured_rect: fitz.Rect) -> fitz.Rect:
    return fitz.Rect(
        featured_rect.x0 + 10,
        featured_rect.y0 + 8,
        featured_rect.x0 + featured_rect.width * 0.46,
        featured_rect.y0 + featured_rect.height * 0.26,
    )


def featured_top_price_box(featured_rect: fitz.Rect, name_box: fitz.Rect) -> fitz.Rect:
    return fitz.Rect(
        featured_rect.x0 + 10,
        name_box.y1 + 2,
        featured_rect.x0 + featured_rect.width * 0.46,
        name_box.y1 + 18,
    )


def _featured_top_label_zone(featured_rect: fitz.Rect) -> fitz.Rect:
    return fitz.Rect(
        featured_rect.x0 + 4,
        featured_rect.y0 + 4,
        featured_rect.x0 + featured_rect.width * 0.55,
        featured_rect.y0 + featured_rect.height * 0.40,
    )


def _pick_featured_placeholder(
    featured_rect: fitz.Rect,
    placeholders: list[dict],
    used: set[int],
    *,
    layout: str,
) -> int | None:
    zone = _featured_top_label_zone(featured_rect) if layout == "top" else _label_search_rect(featured_rect)
    best_idx = None
    best_area = 0.0
    for i, ph in enumerate(placeholders):
        if i in used:
            continue
        center = fitz.Point((ph["rect"].x0 + ph["rect"].x1) / 2, (ph["rect"].y0 + ph["rect"].y1) / 2)
        if not featured_rect.contains(center):
            continue
        inter = ph["rect"] & zone
        if inter.is_empty:
            continue
        area = inter.width * inter.height
        if area > best_area:
            best_area = area
            best_idx = i
    if best_idx is not None:
        used.add(best_idx)
    return best_idx


def featured_badge_zone(featured_rect: fitz.Rect) -> fitz.Rect:
    return fitz.Rect(
        featured_rect.x0,
        featured_rect.y0 + featured_rect.height * 0.72,
        featured_rect.x1,
        featured_rect.y1 + 4,
    )


def format_pdf_title(title: str) -> str:
    """Limpia ruido del título; el wrap multilínea maneja el largo."""
    t = title.strip()
    for noise in ("Padel Racket ", "Pickleball Paddle ", "Padel ", "Pickleball "):
        if t.startswith(noise):
            t = t[len(noise) :]
    return " ".join(t.split())


def _label_search_rect(slot_rect: fitz.Rect) -> fitz.Rect:
    """Zona nombre/precio: franja inferior izquierda de la tarjeta."""
    return fitz.Rect(
        slot_rect.x0 + 4,
        slot_rect.y0 + slot_rect.height * 0.56,
        slot_rect.x0 + slot_rect.width * 0.58,
        slot_rect.y1 + 6,
    )


def _pick_placeholder(
    slot_rect: fitz.Rect,
    placeholders: list[dict],
    used: set[int],
    featured_rects: list[fitz.Rect] | None = None,
) -> int | None:
    zone = _label_search_rect(slot_rect)
    best_idx = None
    best_area = 0.0
    for i, ph in enumerate(placeholders):
        if i in used:
            continue
        center = fitz.Point((ph["rect"].x0 + ph["rect"].x1) / 2, (ph["rect"].y0 + ph["rect"].y1) / 2)
        if featured_rects and any(fr.contains(center) for fr in featured_rects):
            continue
        inter = ph["rect"] & zone
        if inter.is_empty:
            continue
        area = inter.width * inter.height
        if area > best_area:
            best_area = area
            best_idx = i
    if best_idx is not None:
        used.add(best_idx)
    return best_idx


def _truncate_to_width(text: str, max_width: float, fontsize: float, fontname: str = "helv") -> str:
    t = text.strip()
    if fitz.get_text_length(t, fontname=fontname, fontsize=fontsize) <= max_width:
        return t
    while len(t) > 4:
        t = t[:-1].rstrip()
        candidate = t + "..."
        if fitz.get_text_length(candidate, fontname=fontname, fontsize=fontsize) <= max_width:
            return candidate
    return t


def write_multiline_name_label(
    page: fitz.Page,
    box: fitz.Rect,
    text: str,
    fontsize: float,
    name_ph_rect: fitz.Rect,
    fill=CARD_BG,
    *,
    min_font: float = MIN_NAME_FONT,
) -> None:
    if not text:
        return
    page.add_redact_annot(
        fitz.Rect(name_ph_rect.x0 - 1, name_ph_rect.y0 - 1, name_ph_rect.x1 + 2, name_ph_rect.y1 + 2),
        fill=fill,
    )
    page.add_redact_annot(box, fill=fill)
    page.apply_redactions()

    fitted = min(max(fontsize, min_font), 10.5)
    while fitted >= min_font:
        rc = page.insert_textbox(
            box,
            text,
            fontsize=fitted,
            fontname="hebo",
            color=(0.12, 0.12, 0.12),
            align=fitz.TEXT_ALIGN_LEFT,
        )
        if rc >= 0:
            return
        page.add_redact_annot(box, fill=fill)
        page.apply_redactions()
        fitted -= 0.35

    page.add_redact_annot(box, fill=fill)
    page.apply_redactions()
    short = _truncate_to_width(text, box.width * NAME_MAX_LINES * 0.9, min_font)
    page.insert_textbox(
        box,
        short,
        fontsize=min_font,
        fontname="hebo",
        color=(0.12, 0.12, 0.12),
        align=fitz.TEXT_ALIGN_LEFT,
    )


def write_text_in_place(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    fontsize: float,
    color=(0.12, 0.12, 0.12),
    fill=CARD_BG,
    *,
    min_font: float = MIN_NAME_FONT,
    redact_rect: fitz.Rect | None = None,
) -> None:
    if not text:
        return
    box = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y1)
    wipe = redact_rect or box
    page.add_redact_annot(
        fitz.Rect(wipe.x0 - 1, wipe.y0 - 1, wipe.x1 + 2, wipe.y1 + 2),
        fill=fill,
    )
    page.apply_redactions()

    fitted = min(max(fontsize, min_font), 12.5)
    while fitted > min_font:
        if fitz.get_text_length(text, fontname="helv", fontsize=fitted) <= box.width * 1.05:
            break
        fitted -= 0.25

    display = _truncate_to_width(text, box.width * 1.05, fitted)
    baseline_y = box.y0 + fitted * 0.9
    page.insert_text(
        fitz.Point(box.x0, baseline_y),
        display,
        fontsize=fitted,
        fontname="helv",
        color=color,
    )


def write_slot_labels(
    page: fitz.Page,
    slot_rect: fitz.Rect,
    names: list[dict],
    prices: list[dict],
    used_names: set[int],
    used_prices: set[int],
    title: str,
    price: str,
    featured_rects: list[fitz.Rect] | None = None,
) -> None:
    pi = _pick_placeholder(slot_rect, prices, used_prices, featured_rects)
    ni = _pick_placeholder(slot_rect, names, used_names, featured_rects)

    if ni is not None and title and pi is not None:
        name_box = slot_name_box(slot_rect, prices[pi], names[ni])
        write_multiline_name_label(
            page,
            name_box,
            title,
            names[ni]["size"],
            names[ni]["rect"],
            min_font=MIN_NAME_FONT,
        )
    elif ni is not None and title:
        name_box = expand_label_rect(slot_rect, names[ni]["rect"], line="name")
        write_multiline_name_label(
            page,
            name_box,
            title,
            names[ni]["size"],
            names[ni]["rect"],
            min_font=MIN_NAME_FONT,
        )

    if pi is not None and price:
        price_box = expand_label_rect(slot_rect, prices[pi]["rect"], line="price")
        write_text_in_place(
            page,
            price_box,
            price,
            prices[pi]["size"],
            min_font=MIN_PRICE_FONT,
            redact_rect=prices[pi]["rect"],
        )


def detect_featured_label_layout(featured_rect: fitz.Rect, names: list[dict]) -> str:
    """Pág. 2: 'Nombre Destacado' arriba. Pág. 3: 'Nombre' abajo."""
    top_zone = fitz.Rect(
        featured_rect.x0 + 4,
        featured_rect.y0 + 4,
        featured_rect.x1 - 4,
        featured_rect.y0 + featured_rect.height * 0.38,
    )
    for ph in names:
        if ph.get("featured") and not (ph["rect"] & top_zone).is_empty:
            return "top"
    return "bottom"


def clear_featured_label_placeholders(page: fitz.Page, featured_rect: fitz.Rect) -> None:
    """Quita placeholders del template dentro de la tarjeta verde (sin tocar el badge)."""
    badge_rect = find_badge_in_featured(page, featured_rect)
    bottom_badge = featured_badge_zone(featured_rect)
    touched = False
    for block in page.get_text("dict").get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = (span.get("text") or "").strip()
                if not text or _is_badge_text(text):
                    continue
                rect = _span_rect(span)
                center = fitz.Point((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)
                if not featured_rect.contains(center):
                    continue
                if badge_rect and badge_rect.contains(center):
                    continue
                if bottom_badge.contains(center):
                    continue
                low = text.lower()
                if low in NAME_PLACEHOLDERS or low.startswith("nombre") or low.startswith(PRICE_PLACEHOLDER_PREFIX):
                    page.add_redact_annot(rect + (-1, -1, 1, 1), fill=FEATURED_BG)
                    touched = True
    if touched:
        page.apply_redactions()


def write_featured_labels(
    page: fitz.Page,
    featured_rect: fitz.Rect,
    names: list[dict],
    prices: list[dict],
    used_names: set[int],
    used_prices: set[int],
    title: str,
    price: str,
) -> None:
    clear_featured_label_placeholders(page, featured_rect)

    if detect_featured_label_layout(featured_rect, names) == "bottom":
        pi = _pick_featured_placeholder(featured_rect, prices, used_prices, layout="bottom")
        ni = _pick_featured_placeholder(featured_rect, names, used_names, layout="bottom")
        if ni is not None and title and pi is not None:
            name_box = slot_name_box(featured_rect, prices[pi], names[ni])
            write_multiline_name_label(
                page,
                name_box,
                title,
                names[ni]["size"],
                names[ni]["rect"],
                fill=FEATURED_BG,
                min_font=MIN_NAME_FONT,
            )
        elif ni is not None and title:
            name_box = expand_label_rect(featured_rect, names[ni]["rect"], line="name")
            write_multiline_name_label(
                page,
                name_box,
                title,
                names[ni]["size"],
                names[ni]["rect"],
                fill=FEATURED_BG,
                min_font=MIN_NAME_FONT,
            )
        if pi is not None and price:
            price_box = expand_label_rect(featured_rect, prices[pi]["rect"], line="price")
            write_text_in_place(
                page,
                price_box,
                price,
                prices[pi]["size"],
                fill=FEATURED_BG,
                min_font=MIN_PRICE_FONT,
                redact_rect=prices[pi]["rect"],
            )
        return

    pi = _pick_featured_placeholder(featured_rect, prices, used_prices, layout="top")
    ni = _pick_featured_placeholder(featured_rect, names, used_names, layout="top")
    name_ph = names[ni] if ni is not None else None
    price_ph = prices[pi] if pi is not None else None
    name_box = featured_top_name_box(featured_rect)

    if title:
        write_multiline_name_label(
            page,
            name_box,
            title,
            name_ph.get("size", 12.0) if name_ph else 12.0,
            name_ph["rect"] if name_ph else name_box,
            fill=FEATURED_BG,
            min_font=9.5,
        )
    if price:
        price_box = featured_top_price_box(featured_rect, name_box)
        write_text_in_place(
            page,
            price_box,
            price,
            price_ph.get("size", 10.0) if price_ph else 10.0,
            fill=FEATURED_BG,
            min_font=MIN_PRICE_FONT,
            redact_rect=price_box,
        )


def fill_product_slot(
    page: fitz.Page,
    page_num: int,
    slot_info: dict,
    row: dict,
    names_ph: list[dict],
    prices_ph: list[dict],
    used_names: set[int],
    used_prices: set[int],
    *,
    featured: bool = False,
    featured_rects: list[fitz.Rect] | None = None,
) -> dict | None:
    handle = (row.get("handle") or "").strip()
    if not handle and not (row.get("variant_id") or "").strip():
        return None

    image_url, variant_id, link_url, display_title, price_label = resolve_product(row)
    if not image_url:
        return None

    hotspot_label = (row.get("title") or display_title or row.get("label") or handle).strip()
    pdf_title = format_pdf_title(
        (row.get("title") or row.get("short_title") or display_title or hotspot_label).strip()
    )

    slot_rect = slot_info["rect"]
    if featured:
        clear_featured_placeholder(page, slot_rect)
        img_bytes = fetch_bytes(image_url)
        pix = fitz.Pixmap(img_bytes)
        img_rect = fit_featured_image_rect(slot_rect, pix.width, pix.height)
        page.insert_image(img_rect, stream=img_bytes, keep_proportion=False)
        write_featured_labels(page, slot_rect, names_ph, prices_ph, used_names, used_prices, pdf_title, price_label)
    else:
        img_bytes = fetch_bytes(image_url)
        pix = fitz.Pixmap(img_bytes)
        img_rect = fit_image_rect(slot_rect, pix.width, pix.height)
        page.insert_image(img_rect, stream=img_bytes, keep_proportion=False)
        write_slot_labels(
            page,
            slot_rect,
            names_ph,
            prices_ph,
            used_names,
            used_prices,
            pdf_title,
            price_label,
            featured_rects,
        )

    try:
        page.insert_link({"kind": fitz.LINK_URI, "from": slot_rect, "uri": link_url})
    except Exception:
        pass

    hotspot = {
        "slot": slot_info.get("slot"),
        "preset": f"rc-template-p{page_num}",
        "x": slot_info["x"],
        "y": slot_info["y"],
        "w": slot_info["w"],
        "h": slot_info["h"],
        "action": row.get("action") or "add",
        "quantity": int(row.get("quantity") or 1),
        "label": hotspot_label,
        "featured": featured,
    }
    if variant_id:
        hotspot["variantId"] = variant_id
    if link_url:
        hotspot["href"] = link_url
    return hotspot


def fill_template(
    template_path: Path,
    csv_path: Path,
    out_pdf: Path,
    out_hotspots: Path,
    pages_filter: set[int] | None = None,
) -> dict:
    csv_rows = load_csv_rows(csv_path)
    base_path = template_path
    if pages_filter and out_pdf.exists():
        base_path = out_pdf
    doc = fitz.open(base_path)
    template_doc = fitz.open(template_path)
    hotspots: dict[str, list] = {}
    report = {"filled": [], "skipped": [], "errors": []}

    for page_idx in range(doc.page_count):
        page_num = page_idx + 1
        if pages_filter and page_num not in pages_filter:
            continue

        page = doc[page_idx]
        tpl_page = template_doc[page_idx]
        slots = detect_page_slots(tpl_page)
        if not slots:
            continue

        names_ph, prices_ph = find_text_placeholders(tpl_page)
        used_names: set[int] = set()
        used_prices: set[int] = set()
        page_hotspots: list[dict] = []
        featured_slots = detect_featured_slots(tpl_page)
        featured_rects = [f["rect"] for f in featured_slots]

        for slot_info in slots:
            clear_white_slot_images(page, slot_info["rect"])

        for feat_idx, feat in enumerate(featured_slots, 1):
            feat_slot_num = len(slots) + feat_idx
            feat["slot"] = feat_slot_num
            row = csv_rows.get((page_num, feat_slot_num)) or csv_rows.get((page_num, 1))
            if not row:
                continue
            try:
                hotspot = fill_product_slot(
                    page,
                    page_num,
                    feat,
                    row,
                    names_ph,
                    prices_ph,
                    used_names,
                    used_prices,
                    featured=True,
                    featured_rects=featured_rects,
                )
                if not hotspot:
                    continue
                page_hotspots.append(hotspot)
                report["filled"].append(
                    {
                        "page": page_num,
                        "slot": feat_slot_num,
                        "label": hotspot["label"],
                        "featured": True,
                        "handle": row.get("handle"),
                    }
                )
            except Exception as err:
                report["errors"].append(
                    {"page": page_num, "slot": feat_slot_num, "featured": True, "error": str(err)}
                )

        for slot_info in slots:
            slot_num = slot_info["slot"]
            row = csv_rows.get((page_num, slot_num))
            if not row:
                report["skipped"].append({"page": page_num, "slot": slot_num, "reason": "sin fila CSV"})
                continue
            try:
                hotspot = fill_product_slot(
                    page,
                    page_num,
                    slot_info,
                    row,
                    names_ph,
                    prices_ph,
                    used_names,
                    used_prices,
                    featured_rects=featured_rects,
                )
                if not hotspot:
                    report["skipped"].append({"page": page_num, "slot": slot_num, "reason": "sin producto"})
                    continue
                page_hotspots.append(hotspot)
                report["filled"].append(
                    {"page": page_num, "slot": slot_num, "label": hotspot["label"], "handle": row.get("handle")}
                )
            except Exception as err:
                report["errors"].append({"page": page_num, "slot": slot_num, "error": str(err)})

        if page_hotspots:
            hotspots[str(page_num)] = page_hotspots

    out_pdf.parent.mkdir(parents=True, exist_ok=True)
    save_target = out_pdf
    if base_path.resolve() == out_pdf.resolve():
        save_target = out_pdf.with_name(f"{out_pdf.stem}.__tmp__{out_pdf.suffix}")
    doc.save(save_target, deflate=True, garbage=4)
    doc.close()
    if save_target != out_pdf:
        save_target.replace(out_pdf)
    template_doc.close()

    if pages_filter and out_hotspots.exists():
        try:
            existing = json.loads(out_hotspots.read_text(encoding="utf-8"))
            for page_key in list(existing.keys()):
                if int(page_key) not in pages_filter:
                    hotspots[page_key] = existing[page_key]
        except (json.JSONDecodeError, ValueError):
            pass

    out_hotspots.parent.mkdir(parents=True, exist_ok=True)
    out_hotspots.write_text(json.dumps(hotspots, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    report["summary"] = {
        "filled": len(report["filled"]),
        "skipped": len(report["skipped"]),
        "errors": len(report["errors"]),
        "pages_with_hotspots": len(hotspots),
    }
    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    parser.add_argument("--template", type=Path, default=TEMPLATE_PDF)
    parser.add_argument("--out-pdf", type=Path, default=OUT_PDF)
    parser.add_argument("--out-hotspots", type=Path, default=OUT_HOTSPOTS)
    parser.add_argument("--pages", type=str, default="", help="ej: 2,3,4 para piloto parcial")
    args = parser.parse_args()

    if not args.template.is_file():
        print(f"Template no encontrado: {args.template}", file=sys.stderr)
        sys.exit(1)
    if not args.csv.is_file():
        print(f"CSV no encontrado: {args.csv}", file=sys.stderr)
        sys.exit(1)

    pages_filter = None
    if args.pages.strip():
        pages_filter = {int(p.strip()) for p in args.pages.split(",") if p.strip()}

    print(f"Template: {args.template.name}")
    print(f"CSV: {args.csv.name}")
    if pages_filter:
        print(f"Páginas: {sorted(pages_filter)}")

    report = fill_template(args.template, args.csv, args.out_pdf, args.out_hotspots, pages_filter)
    s = report["summary"]
    print(f"\nListo — {s['filled']} productos colocados")
    print(f"  PDF: {args.out_pdf}")
    print(f"  Hotspots: {args.out_hotspots}")
    print(f"  Reporte: {OUT_REPORT}")
    if s["skipped"]:
        print(f"  Omitidos: {s['skipped']}")
    if s["errors"]:
        print(f"  Errores: {s['errors']}")


if __name__ == "__main__":
    main()
