# Subterra Clash — Demo Script (target: 4 minutes)

> Before every run: `POST /api/reset`, browser at `/`, zoom 100%, second tab with `/dashboard` ready, sample permit PDFs on the desktop.
> Rehearse with a timer. If something breaks, skip to the next beat — never debug on stage.

---

**0:00 — The hook (Landing)**
"Every Indian city has this story: a road is dug for water, re-laid, and dug again a month later for fibre. Sometimes the excavator hits a gas line. The problem isn't digging — it's that nobody can see what's already underground, and the records don't agree."
→ Click **Enter Sector 7**.

**0:25 — See underground (Workspace, 3D)**
Start at **street level** on Station Road, then hit **X-ray** to reveal what's underneath. Click **Overview**, orbit slowly.
"This is a synthetic city block. Each colour is a utility — red power, yellow gas, blue water, green sewer, orange telecom — at its recorded depth. Pink volumes are proposed works from permits."
Toggle **uncertainty halos**: "Some records are surveyed to 10 cm. Some were digitised from paper maps — ±2 m. We draw that uncertainty instead of hiding it."

**0:55 — A critical clash (T1)**
Click the pulsing red marker → camera flies in → panel opens.
"A trench cuts straight through a gas main. Measured gap −0.4 m, required 1.0 m. Here's the source record, the rule, and the severity breakdown. Certainty: LIKELY."
Drag the **section plane** across → cross-section shows the dimension line.

**1:25 — What a normal GIS overlay gets wrong (T4, T5)**
Click the T5 marker: "This new water main runs 20 cm beside an existing one. They never cross on a 2D map, so a normal overlay misses it. We catch it."
Point at T4 (no marker): "And here a trench crosses a sewer 4 m deep — a 2D overlay raises a false alarm. We know the trench is only 1.5 m deep."

**1:50 — Honest uncertainty (T3, T6)**
Click the dashed POSSIBLE marker: "This one depends on where the telecom duct really is — ±2 m. We say POSSIBLE and send it to field verification."
Click the grey "?" marker: "This cable's depth is unknown. We don't guess — NEEDS DATA."

**2:15 — Live permit intake (the wow)**
Go to **Intake** → drop the Hinglish sample PDF (or click sample 2).
Fields fill in one by one with confidence chips; hover a field to show the highlighted source quote.
"The LLM reads a messy permit, but it never invents geometry — every value points to the exact words it came from, and missing depth is flagged, not guessed. A deterministic geocoder places it on our street map."
Click **Add to coordination plan** → workspace → new pink trench appears, 2–3 new markers animate in.

**3:00 — Review queue & coordination**
Go to **Queue**: "Clashes are grouped and ranked — review the gas line first."
Escalate one with a note → toast. Point at the schedule strip: "Two works on Vikas Marg 45 days apart — we suggest digging once."
Click **Export report** → printable inspection report.
"Notice what's not here: an approve button. The tool never approves or rejects a permit. It tells engineers where to look."

**3:30 — Proof (Dashboard)**
"On our planted test cases, a plain 2D overlay catches 2 of 5 real conflicts and raises a false alarm. Ours catches all 5 with no false alarms, and flags uncertain ones honestly."
(Read the real numbers from the screen — do not memorise these.)

**3:45 — Close**
"Subterra Clash: see underground before you dig. The same engine works for metro construction, fibre rollout, and gas pipeline safety — anywhere departments share the ground."

---

## Likely judge questions
- **Where does real data come from?** Utility GIS exports (shapefiles/GeoJSON) and permit portals; our model already handles mixed precision, so ingestion is an adapter, not a redesign.
- **Why not let the LLM do the geometry?** Hallucinated coordinates are dangerous; extraction is LLM, placement is deterministic and auditable.
- **What if the LLM is down?** Cached mode; the demo is running offline right now (if true).
- **Are the clearance values real?** Illustrative for the exercise, declared in one rules file, replaceable with IS / CPWD / utility-specific values.
- **How do you avoid alarm fatigue?** Certainty classes + severity ranking + grouping; the baseline comparison shows fewer false alarms.