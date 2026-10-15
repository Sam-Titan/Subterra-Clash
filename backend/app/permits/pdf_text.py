"""PDF → plain text with PyMuPDF."""

import re

import pymupdf

MAX_PDF_BYTES = 5 * 1024 * 1024


class PdfTooLargeError(ValueError):
    """PDF is larger than 5 MB (API: 413 FILE_TOO_LARGE)."""


class PdfNoTextError(ValueError):
    """PDF is unreadable or has no extractable text (API: 422 PDF_NO_TEXT)."""


def extract_pdf_text(data: bytes) -> str:
    if len(data) > MAX_PDF_BYTES:
        raise PdfTooLargeError(f"PDF is {len(data)} bytes; limit is {MAX_PDF_BYTES}")
    try:
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            pages = [page.get_text("text") for page in doc]
    except Exception as exc:
        raise PdfNoTextError("Could not read the PDF") from exc
    text = re.sub(r"\s+", " ", " ".join(pages)).strip()
    if not text:
        raise PdfNoTextError("PDF has no extractable text (scanned image?)")
    return text
