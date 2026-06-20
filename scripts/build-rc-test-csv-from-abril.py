#!/usr/bin/env python3
"""
Genera CSV de prueba para el template RC a partir de productos extraídos del PDF Abril.
Resuelve handle + variant_id contra racketcentral.com (API pública).

Uso:
  python scripts/extract-abril-products.py
  python scripts/build-rc-test-csv-from-abril.py
"""
from __future__ import annotations

import csv
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTRACTED = ROOT / "scripts" / "_output" / "abril-products-extracted.json"
OUT_CSV = ROOT / "src" / "config" / "rc-template-test-from-abril.csv"
OUT_JSON = ROOT / "scripts" / "_output" / "rc-template-test-from-abril.json"

STORE = "racketcentral.com"

# Slots vacíos detectados en catalogo-rc-template.pdf (page -> count)
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


def norm_title(s: str) -> str:
    s = s.lower()
    s = re.sub(r"\$\d+", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def clean_label(label: str) -> str:
    label = re.sub(r"\s+\$\d+\s*$", "", label.strip())
    label = re.sub(r"\s+", " ", label)
    return label


def is_valid_product_label(label: str) -> bool:
    if "|" in label:
        return False
    if len(label) < 8:
        return False
    low = label.lower()
    junk = (
        "shop now",
        "contact us",
        "visit our",
        "follow us",
        "minimum order",
        "new launches",
        "collection",
        "racketcentral",
    )
    if any(j in low for j in junk):
        return False
    # debe parecer producto: marca o año
    if re.search(r"\b20\d{2}\b", label):
        return True
    brands = (
        "nox",
        "adidas",
        "bullpadel",
        "head",
        "babolat",
        "wilson",
        "siux",
        "vibora",
        "starvie",
        "dunlop",
        "prince",
        "yonex",
        "selkirk",
        "joola",
        "paddletek",
        "gearbox",
        "engage",
        "diadem",
    )
    return any(b in low for b in brands)


def load_abril_products(path: Path) -> list[dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    cleaned: list[dict] = []
    seen: set[str] = set()
    for row in raw:
        label = clean_label(row.get("label", ""))
        if not is_valid_product_label(label):
            continue
        key = norm_title(label)
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(
            {
                "abril_page": row["page"],
                "label": label,
                "price": row.get("price", ""),
            }
        )
    return cleaned


def fetch_json(url: str) -> dict | list:
    req = urllib.request.Request(url, headers={"User-Agent": "rc-catalog-builder/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_all_shopify_products() -> list[dict]:
    products: list[dict] = []
    page = 1
    while page <= 40:
        url = f"https://{STORE}/products.json?limit=250&page={page}"
        try:
            data = fetch_json(url)
        except Exception:
            break
        batch = data.get("products") or []
        if not batch:
            break
        products.extend(batch)
        if len(batch) < 250:
            break
        page += 1
    return products


def build_title_index(products: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for p in products:
        title = p.get("title") or ""
        handle = p.get("handle") or ""
        variant_id = ""
        variants = p.get("variants") or []
        if variants:
            variant_id = str(variants[0].get("id") or "")
        entry = {"title": title, "handle": handle, "variant_id": variant_id}
        for key in {norm_title(title), norm_title(handle.replace("-", " "))}:
            if key:
                index[key] = entry
    return index


def match_product(label: str, index: dict[str, dict], products: list[dict]) -> dict | None:
    keys = [norm_title(label)]
    # quitar prefijos comunes del PDF
    for prefix in ("adidas padel racket ", "nox ", "bullpadel "):
        if keys[0].startswith(prefix):
            keys.append(keys[0][len(prefix) :].strip())

    for key in keys:
        if key in index:
            return index[key]

    # fuzzy: mejor título que contenga la mayoría de tokens
    tokens = [t for t in keys[0].split() if len(t) > 2]
    if len(tokens) < 3:
        return None
    best = None
    best_score = 0
    for p in products:
        title_norm = norm_title(p.get("title") or "")
        score = sum(1 for t in tokens if t in title_norm)
        if score > best_score and score >= max(3, len(tokens) - 2):
            best_score = score
            best = p
    if not best:
        return None
    return {
        "title": best.get("title"),
        "handle": best.get("handle"),
        "variant_id": str((best.get("variants") or [{}])[0].get("id") or ""),
    }


def iter_rc_slots() -> list[tuple[int, int]]:
    slots: list[tuple[int, int]] = []
    for page in sorted(RC_TEMPLATE_SLOTS):
        for slot in range(1, RC_TEMPLATE_SLOTS[page] + 1):
            slots.append((page, slot))
    return slots


def main() -> None:
    extracted_path = Path(sys.argv[1]) if len(sys.argv) > 1 else EXTRACTED
    if not extracted_path.is_file():
        print(f"No existe {extracted_path}. Corré extract-abril-products.py primero.", file=sys.stderr)
        sys.exit(1)

    abril_products = load_abril_products(extracted_path)
    rc_slots = iter_rc_slots()
    limit = min(len(abril_products), len(rc_slots))

    print(f"Productos Abril limpios: {len(abril_products)}")
    print(f"Slots RC template: {len(rc_slots)}")
    print(f"Filas CSV de prueba: {limit}")
    print("Descargando catálogo Shopify…")

    shopify_products = fetch_all_shopify_products()
    title_index = build_title_index(shopify_products)
    print(f"Productos Shopify indexados: {len(shopify_products)}")

    rows: list[dict] = []
    matched = 0
    for i in range(limit):
        src = abril_products[i]
        page, slot = rc_slots[i]
        match = match_product(src["label"], title_index, shopify_products)
        handle = match["handle"] if match else ""
        variant_id = match["variant_id"] if match else ""
        href = f"https://{STORE}/products/{handle}" if handle else ""
        if match:
            matched += 1
        rows.append(
            {
                "page": page,
                "slot": slot,
                "handle": handle,
                "label": src["label"],
                "variant_id": variant_id,
                "href": href,
                "action": "add",
                "quantity": 1,
                "abril_page": src["abril_page"],
                "price": src.get("price", ""),
                "shopify_title": (match or {}).get("title", ""),
            }
        )

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "page",
        "slot",
        "handle",
        "label",
        "variant_id",
        "href",
        "action",
        "quantity",
        "abril_page",
        "price",
        "shopify_title",
    ]
    with OUT_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Match Shopify: {matched}/{limit} ({round(100*matched/limit,1)}%)")
    print(f"CSV: {OUT_CSV}")
    print(f"JSON: {OUT_JSON}")


if __name__ == "__main__":
    main()
