#!/usr/bin/env python3
"""Extract product labels from catalogo-abril.pdf text blocks."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "public" / "catalogo-abril.pdf"

NOISE = {
    "RCSPRING30",
    "USE THIS CUPON",
    "AT CHECKOUT:",
    "FREE",
    "SHIPPING",
    "SHOP NOW",
    "CONTACT US",
    "VISIT OUR WEBSITE",
    "FOLLOW US",
    "IN PADEL RACKETS AND",
    "PICKLEBALL PADDLES!",
    "Best seller",
    "www.racketcentral.com",
    "@racketcentralusa",
    "*MINIMUM ORDER: $150",
    "$30 OFF",
    "*ORDERS OVER $99",
    "*",
    "+1 786-658-8148",
}


def is_price(text: str) -> bool:
    return bool(re.fullmatch(r"\$\d{1,4}", text.strip()))


def is_noise(text: str) -> bool:
    t = text.strip()
    if not t or t in NOISE:
        return True
    low = t.lower()
    for token in ("racketcentral", "checkout", "cupon", "shipping", "contact", "website", "follow"):
        if token in low:
            return True
    return False


def extract_products(pdf_path: Path) -> list[dict]:
    doc = fitz.open(pdf_path)
    products: list[dict] = []

    for pn in range(2, doc.page_count + 1):
        page = doc[pn - 1]
        blocks = page.get_text("blocks")
        items: list[dict] = []

        for b in blocks:
            txt = " ".join(b[4].strip().split())
            if is_noise(txt):
                continue
            if is_price(txt):
                items.append({"y": b[1], "x": b[0], "price": txt, "type": "price"})
                continue
            if len(txt) < 4:
                continue
            items.append({"y": b[1], "x": b[0], "text": txt, "type": "text"})

        texts = [i for i in items if i["type"] == "text"]
        prices = [i for i in items if i["type"] == "price"]
        used: set[int] = set()
        page_products: list[dict] = []

        for t in sorted(texts, key=lambda z: (z["y"], z["x"])):
            best_idx = None
            best_dy = 9999.0
            for pi, p in enumerate(prices):
                if pi in used:
                    continue
                if abs(p["x"] - t["x"]) > 130:
                    continue
                dy = p["y"] - t["y"]
                if 0 < dy < 95 and dy < best_dy:
                    best_dy = dy
                    best_idx = pi

            label = t["text"]
            price = prices[best_idx]["price"] if best_idx is not None else ""
            if best_idx is not None:
                used.add(best_idx)

            if len(label.split()) < 2 and not re.search(r"\d{4}", label):
                continue

            page_products.append(
                {"page": pn, "label": label, "price": price, "y": round(t["y"], 1), "x": round(t["x"], 1)}
            )

        dedup: list[dict] = []
        for p in sorted(page_products, key=lambda z: (z["y"], z["x"])):
            if dedup and p["label"] == dedup[-1]["label"]:
                continue
            dedup.append(p)
        products.extend(dedup)

    doc.close()
    return products


def main() -> None:
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else PDF
    if not pdf_path.is_file():
        print(f"PDF no encontrado: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    products = extract_products(pdf_path)
    out = ROOT / "scripts" / "_output" / "abril-products-extracted.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(products, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    by_page: dict[int, int] = {}
    for p in products:
        by_page[p["page"]] = by_page.get(p["page"], 0) + 1

    print(f"Extraídos {len(products)} productos de {pdf_path.name}")
    for pn in sorted(by_page):
        print(f"  pág. {pn}: {by_page[pn]}")
    print(f"Escrito: {out}")


if __name__ == "__main__":
    main()
