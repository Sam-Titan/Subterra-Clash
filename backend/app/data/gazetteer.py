"""Fixed synthetic geography of Navgarh — Sector 7 (600 x 400 m, SPEC §6/§7.1)."""

from app.models import Junction, Landmark, Street

BOUNDS = (0.0, 0.0, 600.0, 400.0)

STREETS: list[Street] = [
    Street(id="ST-01", name="Station Road", centerline=[(0, 200), (600, 200)], width_m=18),
    Street(id="ST-02", name="Vikas Marg", centerline=[(180, 0), (180, 400)], width_m=14),
    Street(id="ST-03", name="Gulmohar Lane", centerline=[(400, 0), (400, 400)], width_m=10),
    Street(id="ST-04", name="Nehru Path", centerline=[(0, 320), (600, 320)], width_m=12),
    Street(id="ST-05", name="Lake View Road", centerline=[(0, 80), (600, 80)], width_m=12),
    Street(id="ST-06", name="Sector Main Road", centerline=[(520, 0), (520, 400)], width_m=16),
]

JUNCTIONS: list[Junction] = [
    Junction(id="JN-01", name="J1 — Vikas Marg × Lake View Road", x=180, y=80),
    Junction(id="JN-02", name="J2 — Vikas Marg × Nehru Path", x=180, y=320),
    Junction(id="JN-03", name="J3 — Vikas Marg × Station Road", x=180, y=200),
    Junction(id="JN-04", name="J4 — Gulmohar Lane × Lake View Road", x=400, y=80),
    Junction(id="JN-05", name="J5 — Gulmohar Lane × Station Road", x=400, y=200),
    Junction(id="JN-06", name="J6 — Gulmohar Lane × Nehru Path", x=400, y=320),
    Junction(id="JN-07", name="J7 — Sector Main Road × Station Road", x=520, y=200),
    Junction(id="JN-08", name="J8 — Sector Main Road × Nehru Path", x=520, y=320),
]

LANDMARKS: list[Landmark] = [
    Landmark(id="LM-01", name="Govt. School", x=250, y=150),
    Landmark(id="LM-02", name="Bus Depot", x=420, y=214),
    Landmark(id="LM-03", name="Water Tank", x=100, y=350),
    Landmark(id="LM-04", name="Community Hall", x=300, y=120),
    Landmark(id="LM-05", name="Lake Park Gate", x=560, y=40),
]
