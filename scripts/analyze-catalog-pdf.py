#!/usr/bin/env python3
"""
Detect product card regions (dark rectangles) per PDF page.
Outputs catalog-page-layouts.json + updates grid-presets.json slots.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import fitz

PDF_PATH = Path(
    r"c:\Users\RDari\Downloads\V3_CATALOGO_ABRIL_COMPRIMIDO.pdf"
)
ROOT = Path(__file__).resolve().parent.parent
OUT_LAYOUTS = ROOT / "src/config/catalog-page-layouts.json"
OUT_PRESETS = ROOT / "src/config/grid-presets.json"
FALLBACK_DIR = Path(__file__).resolve().parent / "_output"
RENDER_W = 720


def luminance(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b


def find_dark_boxes(pix, min_area_ratio=0.012, max_area_ratio=0.28):
    w, h = pix.width, pix.height
    n = w * h
    samples = pix.samples
    stride = pix.n
    dark = bytearray(n)
    for i in range(n):
        off = i * stride
        r, g, b = samples[off], samples[off + 1], samples[off + 2]
        dark[i] = 1 if luminance(r, g, b) < 72 else 0

    visited = bytearray(n)
    boxes = []
    min_area = int(n * min_area_ratio)
    max_area = int(n * max_area_ratio)

    def neighbors(x, y):
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                yield nx, ny

    for y in range(h):
        for x in range(w):
            idx = y * w + x
            if not dark[idx] or visited[idx]:
                continue
            stack = [(x, y)]
            visited[idx] = 1
            minx = maxx = x
            miny = maxy = y
            count = 1
            while stack:
                cx, cy = stack.pop()
                for nx, ny in neighbors(cx, cy):
                    ni = ny * w + nx
                    if dark[ni] and not visited[ni]:
                        visited[ni] = 1
                        count += 1
                        minx = min(minx, nx)
                        maxx = max(maxx, nx)
                        miny = min(miny, ny)
                        maxy = max(maxy, ny)
                        stack.append((nx, ny))
            area = (maxx - minx + 1) * (maxy - miny + 1)
            if area < min_area or area > max_area:
                continue
            bw = maxx - minx + 1
            bh = maxy - miny + 1
            aspect = bw / max(bh, 1)
            if aspect < 0.35 or aspect > 3.2:
                continue
            if bh < h * 0.06 or bw < w * 0.08:
                continue
            cy = (miny + maxy) / 2
            if cy < h * 0.14 or cy > h * 0.86:
                continue
            boxes.append((minx, miny, maxx, maxy, area))

    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    merged = []
    for box in boxes:
        minx, miny, maxx, maxy, area = box
        cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
        hit = False
        for i, m in enumerate(merged):
            mcx, mcy = (m[0] + m[2]) / 2, (m[1] + m[3]) / 2
            if abs(cx - mcx) < w * 0.08 and abs(cy - mcy) < h * 0.06:
                merged[i] = (
                    min(minx, m[0]),
                    min(miny, m[1]),
                    max(maxx, m[2]),
                    max(maxy, m[3]),
                    area + m[4],
                )
                hit = True
                break
        if not hit:
            merged.append(list(box))
    merged.sort(key=lambda b: ((b[1] + b[3]) / 2, (b[0] + b[2]) / 2))
    return merged


def norm_box(minx, miny, maxx, maxy, w, h, pad=0.008):
    x = max(0, minx / w - pad)
    y = max(0, miny / h - pad)
    x2 = min(1, (maxx + 1) / w + pad)
    y2 = min(1, (maxy + 1) / h + pad)
    return {
        "x": round(x, 4),
        "y": round(y, 4),
        "w": round(x2 - x, 4),
        "h": round(y2 - y, 4),
    }


def classify_layout(count: int, boxes, w, h) -> str:
    if count == 0:
        return "none"
    if count == 1:
        return "single-1"
    if count == 2:
        return "grid-2x1"
    if count == 3:
        return "grid-3x1"
    if count == 4:
        return "grid-2x2"
    if count == 5:
        return "grid-5"
    if count == 6:
        return "grid-6"
    if count == 7:
        return "grid-7"
    if count == 8:
        ys = [(b[1] + b[3]) / 2 / h for b in boxes]
        ys.sort()
        gaps = [ys[i + 1] - ys[i] for i in range(len(ys) - 1)]
        if len(gaps) >= 2 and max(gaps) > 0.12:
            return "catalog-8"
        return "grid-4x2"
    if count <= 12:
        return f"grid-{count}"
    return "grid-dense"


def preset_label(preset_id: str, count: int) -> str:
    labels = {
        "none": "Sin productos detectados",
        "single-1": "1 producto",
        "grid-2x1": "2 productos (fila)",
        "grid-3x1": "3 productos (fila)",
        "grid-2x2": "4 productos (2×2)",
        "grid-5": "5 productos",
        "grid-6": "6 productos",
        "grid-7": "7 productos",
        "catalog-8": "8 productos (2+2+4)",
        "grid-4x2": "8 productos (4×2)",
    }
    if preset_id in labels:
        return labels[preset_id]
    return f"{count} productos ({preset_id})"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    flags = set(sys.argv[1:])
    pdf_path = Path(args[0]) if args else PDF_PATH
    if not pdf_path.is_file():
        print(f"PDF no encontrado: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    doc = fitz.open(pdf_path)
    presets: dict = {}
    pages: dict = {}

    quiet = "--stdout-layouts" in flags or "--stdout-presets" in flags
    log = (lambda *a, **k: print(*a, **k, file=sys.stderr)) if quiet else print

    log(f"Analizando {doc.page_count} paginas...\n")

    for page_num in range(1, doc.page_count + 1):
        page = doc[page_num - 1]
        rect = page.rect
        scale = RENDER_W / rect.width
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        boxes = find_dark_boxes(pix)
        count = len(boxes)
        preset_id = classify_layout(count, boxes, pix.width, pix.height)

        slots = []
        for i, b in enumerate(boxes):
            slot = norm_box(b[0], b[1], b[2], b[3], pix.width, pix.height)
            slot["label"] = f"Producto {i + 1}"
            slots.append(slot)

        if preset_id != "none" and slots:
            presets.setdefault(
                preset_id,
                {"label": preset_label(preset_id, count), "slots": slots},
            )

        pages[str(page_num)] = {
            "preset": preset_id,
            "productCount": count,
            "note": preset_label(preset_id, count),
            "slots": slots if slots else [],
        }
        log(f"  Pag. {page_num:2d}: {count} productos -> {preset_id}")

    doc.close()

    if "catalog-8" not in presets:
        ref = Path(__file__).resolve().parent.parent / "src/config/grid-presets.json"
        if ref.is_file():
            old = json.loads(ref.read_text(encoding="utf-8"))
            if "catalog-8" in old:
                presets["catalog-8"] = old["catalog-8"]

    layouts = {
        "pdf": pdf_path.name,
        "generatedBy": "scripts/analyze-catalog-pdf.py",
        "pages": pages,
    }

    layouts_text = json.dumps(layouts, indent=2, ensure_ascii=False) + "\n"
    merged_presets = {}
    if OUT_PRESETS.is_file():
        try:
            merged_presets = json.loads(OUT_PRESETS.read_text(encoding="utf-8"))
        except OSError:
            pass
    for pid, body in presets.items():
        merged_presets[pid] = body
    presets_text = json.dumps(merged_presets, indent=2, ensure_ascii=False) + "\n"

    def write_safe(path: Path, text: str) -> Path:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding="utf-8")
            return path
        except OSError:
            FALLBACK_DIR.mkdir(parents=True, exist_ok=True)
            alt = FALLBACK_DIR / path.name
            alt.write_text(text, encoding="utf-8")
            return alt

    if "--stdout-layouts" in flags:
        sys.stdout.write(layouts_text)
        return
    if "--stdout-presets" in flags:
        sys.stdout.write(presets_text)
        return

    p1 = write_safe(OUT_LAYOUTS, layouts_text)
    p2 = write_safe(OUT_PRESETS, presets_text)
    print(f"\nEscrito: {p1}")
    print(f"Actualizado: {p2}")


if __name__ == "__main__":
    main()
