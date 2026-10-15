"""Write the 3 sample permits as PDFs into app/permits/samples/."""

import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # run as a plain script

from app.permits.sample_permits import SAMPLE_PERMITS, SAMPLES_DIR  # noqa: E402

# Base-14 fonts lack the em/en dash used in the permits, so embed a Unicode TTF.
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]


def find_font() -> str:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return path
    raise RuntimeError(f"No Unicode TTF found; tried {FONT_CANDIDATES}")


def main() -> None:
    font_file = find_font()
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    for sample in SAMPLE_PERMITS:
        doc = pymupdf.open()
        page = doc.new_page(width=595, height=842)  # A4
        rect = pymupdf.Rect(56, 72, 539, 400)
        page.insert_font(fontname="body", fontfile=font_file)
        left = page.insert_textbox(rect, sample.text, fontsize=12, fontname="body")
        if left < 0:
            raise RuntimeError(f"{sample.id}: text does not fit on the page")
        doc.save(sample.pdf_path)
        doc.close()
        print(f"wrote {sample.pdf_path}")


if __name__ == "__main__":
    main()
