"""The 3 demo permits: single source for PDFs, cached fixtures and `/api/permits/samples`."""

from pathlib import Path

from app.models.base import ApiModel

PERMITS_DIR = Path(__file__).parent
SAMPLES_DIR = PERMITS_DIR / "samples"
FIXTURES_DIR = PERMITS_DIR / "fixtures"


class SamplePermit(ApiModel):
    id: str
    title: str
    text: str

    @property
    def pdf_path(self) -> Path:
        return SAMPLES_DIR / f"{self.id}.pdf"

    @property
    def fixture_path(self) -> Path:
        return FIXTURES_DIR / f"{self.id}.json"


SAMPLE_PERMITS: list[SamplePermit] = [
    SamplePermit(
        id="sample-1",
        title="Discom 11kV trench — Station Road",
        text=(
            "NVVN Discom — permit 2026/STN/114. Lay 11kV cable by open trench along north side "
            "of Station Road from J3 to Bus Depot, approx 1.2 m deep, 0.6 m wide. "
            "Work 3–20 Nov 2026."
        ),
    ),
    SamplePermit(
        id="sample-2",
        title="Jal Board water line — Station Road (Hinglish)",
        text=(
            "Jal Board Navgarh — permit no. JB/2026/0457. Stn Rd pe J5 se J7 tak 300 mm water "
            "pipe lagbhag 1.5 m gehra khudai karni hai, south side, 2 m offset. "
            "Kaam 12 Nov se 19 Nov 2026 tak."
        ),
    ),
    SamplePermit(
        id="sample-3",
        title="Telecom duct trench — Vikas Marg (depth not stated)",
        text=(
            "Navgarh Fibre Networks — permit NFN/2026/031. Telecom duct (fibre) to be laid by "
            "open trench on Vikas Marg from J1 to J3. Width 0.4 m. Work 24 Nov to 2 Dec 2026. "
            "Depth to be confirmed at site."
        ),
    ),
]


def get_sample(sample_id: str) -> SamplePermit | None:
    return next((s for s in SAMPLE_PERMITS if s.id == sample_id), None)
