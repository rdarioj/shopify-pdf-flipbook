#!/usr/bin/env python3
"""
Arma CSV del template RC desde una colección Shopify.

Acepta:
  - JSON export de colección (solo metadata + handle), ej. 493183893781.json
  - O --handle microsite-rsclub-padel-rackets-2026

Descarga productos vía API pública y los mapea 1:1 a los slots del template RC.

Uso:
  python scripts/build-rc-csv-from-shopify-collection.py C:\\Users\\...\\493183893781.json
  python scripts/build-rc-csv-from-shopify-collection.py --handle microsite-rsclub-padel-rackets-2026
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_CSV = ROOT / "src" / "config" / "rc-template-padel-2026.csv"
OUT_JSON = ROOT / "scripts" / "_output" / "rc-template-padel-2026-products.json"
STORE = "racketcentral.com"

# Slots vacíos del template RC (mismo mapa que fill-rc-template-from-csv.py)
RC_TEMPLATE_SLOTS = {
    2: 4,
    3: 13,
    4: 7,
    5: 14,
    6: 5,
    7: 14,
    8: 12,
    9: 13,
}


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "rc-catalog-builder/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_collection_handle(path: Path | None, handle_arg: str | None) -> tuple[str, dict | None]:
    meta = None
    if path and path.is_file():
        raw = json.loads(path.read_text(encoding="utf-8"))
        col = raw.get("collection") or raw
        meta = col
        handle = (col.get("handle") or "").strip()
        if handle:
            return handle, meta
    if handle_arg:
        return handle_arg.strip(), meta
    raise ValueError("Pasá un JSON de colección o --handle")


def fetch_collection_products(handle: str) -> list[dict]:
    products: list[dict] = []
    page = 1
    while page <= 10:
        url = f"https://{STORE}/collections/{handle}/products.json?limit=250&page={page}"
        data = fetch_json(url)
        batch = data.get("products") or []
        if not batch:
            break
        products.extend(batch)
        if len(batch) < 250:
            break
        page += 1
    return products


def short_title(title: str, vendor: str = "") -> str:
    """Título más corto para el bloque del PDF (2 líneas max ~28 chars)."""
    t = title.strip()
    if vendor and t.lower().startswith(vendor.lower()):
        t = t[len(vendor) :].strip(" -")
    t = t.replace("Padel Racket", "").replace("Pickleball Paddle", "").strip()
    return t or title


def format_price(value: str) -> str:
    try:
        n = float(str(value).replace(",", "."))
        if abs(n - round(n)) < 0.001:
            return f"${int(round(n))}"
        return f"${n:.2f}"
    except ValueError:
        return str(value)


def iter_rc_slots() -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for page in sorted(RC_TEMPLATE_SLOTS):
        for slot in range(1, RC_TEMPLATE_SLOTS[page] + 1):
            out.append((page, slot))
    return out


def product_row(prod: dict, page: int, slot: int) -> dict:
    handle = prod.get("handle") or ""
    title = prod.get("title") or ""
    vendor = prod.get("vendor") or ""
    variants = prod.get("variants") or [{}]
    variant = variants[0]
    variant_id = str(variant.get("id") or "")
    price = format_price(variant.get("price") or "")
    sku = variant.get("sku") or ""
    images = prod.get("images") or []
    image = images[0].get("src") if images else ""
    if image.startswith("//"):
        image = "https:" + image
    href = f"https://{STORE}/products/{handle}" if handle else ""
    return {
        "page": page,
        "slot": slot,
        "handle": handle,
        "title": title,
        "short_title": short_title(title, vendor),
        "price": price,
        "variant_id": variant_id,
        "href": href,
        "image": image,
        "vendor": vendor,
        "sku": sku,
        "action": "add",
        "quantity": 1,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("collection_json", nargs="?", type=Path, default=None)
    parser.add_argument("--handle", type=str, default="")
    parser.add_argument("--out", type=Path, default=OUT_CSV)
    args = parser.parse_args()

    handle, meta = load_collection_handle(args.collection_json, args.handle or None)
    products = fetch_collection_products(handle)
    slots = iter_rc_slots()

    print(f"Colección: {handle}")
    if meta:
        print(f"  Título: {meta.get('title')}")
        print(f"  products_count (meta): {meta.get('products_count')}")
    print(f"  Productos API: {len(products)}")
    print(f"  Slots template RC: {len(slots)}")

    if len(products) < len(slots):
        print(f"  AVISO: faltan {len(slots) - len(products)} productos para llenar todos los slots", file=sys.stderr)
    if len(products) > len(slots):
        print(f"  AVISO: sobran {len(products) - len(slots)} productos (se trunca al número de slots)", file=sys.stderr)

    rows = []
    for i, (page, slot) in enumerate(slots):
        if i >= len(products):
            break
        rows.append(product_row(products[i], page, slot))

    fieldnames = [
        "page",
        "slot",
        "handle",
        "title",
        "short_title",
        "price",
        "variant_id",
        "href",
        "image",
        "vendor",
        "sku",
        "action",
        "quantity",
    ]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"\nCSV: {args.out} ({len(rows)} filas)")
    print(f"JSON: {OUT_JSON}")


if __name__ == "__main__":
    main()
