import pymupdf
import pytest

from app.permits.pdf_text import (
    MAX_PDF_BYTES,
    PdfNoTextError,
    PdfTooLargeError,
    extract_pdf_text,
)
from app.permits.sample_permits import SAMPLE_PERMITS


def _pdf(text: str | None) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    if text:
        page.insert_textbox(pymupdf.Rect(50, 50, 500, 300), text, fontsize=11)
    data = doc.tobytes()
    doc.close()
    return data


def test_round_trip_collapses_wrapping() -> None:
    text = "Permit 7 lay duct along Station Road " * 6
    assert extract_pdf_text(_pdf(text)) == " ".join(text.split())


def test_blank_pdf_has_no_text() -> None:
    with pytest.raises(PdfNoTextError):
        extract_pdf_text(_pdf(None))


def test_garbage_bytes_are_not_a_pdf() -> None:
    with pytest.raises(PdfNoTextError):
        extract_pdf_text(b"not a pdf")


def test_oversize_rejected() -> None:
    with pytest.raises(PdfTooLargeError):
        extract_pdf_text(b"0" * (MAX_PDF_BYTES + 1))


@pytest.mark.parametrize("sample", SAMPLE_PERMITS, ids=lambda s: s.id)
def test_sample_pdfs_round_trip_to_their_text(sample) -> None:
    assert extract_pdf_text(sample.pdf_path.read_bytes()) == sample.text
