#!/usr/bin/env python3
"""
insert_photo.py — Inserts a JPG/PNG image into the PHOTO area (G8:M35)
of the "Spec Sheet" worksheet in an Elite Flower recipe Excel file.

Usage:
    python3 insert_photo.py <excel_path> <image_path>

Exits 0 on success, 1 on error (error message on stderr).
Prints "OK" to stdout on success.
"""

import sys
import os
import tempfile

try:
    from openpyxl import load_workbook
    from openpyxl.drawing.image import Image as XLImage
    from openpyxl.drawing.xdr import XDRPoint2D, XDRPositiveSize2D
    from openpyxl.drawing.spreadsheet_drawing import AbsoluteAnchor
    from openpyxl.utils import get_column_letter
    from openpyxl.utils.units import pixels_to_EMU
    from PIL import Image as PILImage
except ImportError as e:
    print(f"ERROR: Missing Python dependency — {e}\n"
          f"Install with: pip3 install openpyxl pillow", file=sys.stderr)
    sys.exit(1)


def col_px(ws, col_letter: str) -> float:
    """Convert column width units to pixels."""
    w = ws.column_dimensions[col_letter].width
    return (w if w else 8.43) * 7.5


def row_px(ws, row_idx: int) -> float:
    """Convert row height points to pixels."""
    h = ws.row_dimensions[row_idx].height
    return (h if h else 15) * 1.3333


def insert_photo(excel_path: str, image_path: str) -> None:
    if not os.path.isfile(excel_path):
        print(f"ERROR: Excel file not found: {excel_path}", file=sys.stderr)
        sys.exit(1)

    if not os.path.isfile(image_path):
        print(f"ERROR: Image file not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    try:
        wb = load_workbook(excel_path)
    except Exception as e:
        # Common cause: file locked by Excel.app / Microsoft Excel
        err = str(e)
        if 'lock' in err.lower() or 'permission' in err.lower() or 'access' in err.lower():
            print(f"ERROR: Excel file is locked — close it in Excel and try again. ({e})",
                  file=sys.stderr)
        else:
            print(f"ERROR: Cannot open Excel file: {e}", file=sys.stderr)
        sys.exit(1)

    if 'Spec Sheet' not in wb.sheetnames:
        print(f"ERROR: 'Spec Sheet' not found in {os.path.basename(excel_path)}. "
              f"Available sheets: {', '.join(wb.sheetnames)}", file=sys.stderr)
        sys.exit(1)

    ws = wb['Spec Sheet']

    # ── Calculate absolute pixel position of cell G8 ─────────────────────────
    # Sum of column widths A–F (columns 1–6)
    x_offset = sum(col_px(ws, get_column_letter(c)) for c in range(1, 7))
    # Sum of row heights 1–7
    y_offset = sum(row_px(ws, r) for r in range(1, 8))

    # ── Calculate pixel size of area G8:M35 ──────────────────────────────────
    # Columns G(7) through M(13)
    area_w = sum(col_px(ws, get_column_letter(c)) for c in range(7, 14))
    # Rows 8 through 35
    area_h = sum(row_px(ws, r) for r in range(8, 36))

    # ── Load image and compute fit while preserving aspect ratio ─────────────
    try:
        pil_img = PILImage.open(image_path).convert('RGB')
    except Exception as e:
        print(f"ERROR: Cannot open image: {e}", file=sys.stderr)
        sys.exit(1)

    orig_w, orig_h = pil_img.size
    ratio = min(area_w / orig_w, area_h / orig_h)
    new_w = int(orig_w * ratio)
    new_h = int(orig_h * ratio)

    # ── Center image inside the area ─────────────────────────────────────────
    cx = x_offset + (area_w - new_w) / 2
    cy = y_offset + (area_h - new_h) / 2

    # ── Resize to fit and save to a temp PNG ─────────────────────────────────
    tmp_file = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
    tmp_path = tmp_file.name
    tmp_file.close()

    try:
        pil_img.resize((new_w, new_h), PILImage.LANCZOS).save(tmp_path, 'PNG')

        # ── Insert using AbsoluteAnchor (pixel-precise, cell-independent) ────
        xl_img = XLImage(tmp_path)
        xl_img.width  = new_w
        xl_img.height = new_h
        xl_img.anchor = AbsoluteAnchor(
            pos=XDRPoint2D(pixels_to_EMU(int(cx)), pixels_to_EMU(int(cy))),
            ext=XDRPositiveSize2D(pixels_to_EMU(new_w), pixels_to_EMU(new_h))
        )

        # Remove all existing images from the sheet before inserting
        # (prevents duplicates on re-insert; G8:M35 is the only image area)
        ws._images = []
        ws.add_image(xl_img)

        wb.save(excel_path)
        print("OK")

    except Exception as e:
        err = str(e)
        if 'lock' in err.lower() or 'permission' in err.lower():
            print(f"ERROR: Cannot save — file may be open in Excel. Close it and try again. ({e})",
                  file=sys.stderr)
        else:
            print(f"ERROR: Failed to insert image: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: insert_photo.py <excel_path> <image_path>", file=sys.stderr)
        sys.exit(1)

    insert_photo(sys.argv[1], sys.argv[2])
