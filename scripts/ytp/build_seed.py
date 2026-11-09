"""Builds supabase/migrations/045_ytp_seed.sql from the Excel rows.

Run:  python3 scripts/ytp/build_seed.py
"""
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import excel_rows as X  # noqa: E402

SEASON_START = dt.date(2026, 9, 7)
WEEKS = 52
EXCEL_WEEKS = 48

ATHLETES = [
    # sheet, display name, category, level
    ("Audrey", "Winter Somoso", "Cadet Female -47kg", "National"),
    ("Maddie", "Maddie Harbinson", "Junior Female -52kg", "National"),
    ("Daniel", "Daniel Esguerra", "Junior Male -49kg", "National"),
    ("David", "David", "Junior Male -73kg", "National"),
]

SKILL_CODE = {"a": "D", "c": "C", "r": "R", "i": "I"}
PHASE = {
    "General Prep": "General Prep", "Specific Prep": "Specific Prep",
    "Pre-Comp": "Pre-Competition", "Comp": "Competition", "Taper": "Taper",
    "Peak": "Peak", "Transition": "Transition", "Break": "Break",
}

problems = []


def cells_after(line, label_cols=2):
    """Week values (index 0 = week 1) from a full Excel row."""
    parts = line.split("\t")[label_cols:]
    return [p.strip() for p in parts]


def pattern_cells(pattern):
    return [p.strip() for p in pattern.split("\t")] if pattern else []


def check_len(name, vals, must_reach_end):
    if len(vals) > EXCEL_WEEKS:
        problems.append(f"{name}: {len(vals)} cells (more than {EXCEL_WEEKS})")
    if must_reach_end and len(vals) != EXCEL_WEEKS:
        problems.append(f"{name}: ends at week {len(vals)}, expected {EXCEL_WEEKS}")


def num(v):
    return None if v == "" else float(v)


def week_start(w):
    return SEASON_START + dt.timedelta(days=7 * (w - 1))


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def qn(v):
    if v is None:
        return "null"
    return str(int(v)) if float(v).is_integer() else str(v)


def build():
    out = []
    summary = {}
    for sheet, name, category, level in ATHLETES:
        maddie = sheet == "Maddie"
        macro = cells_after(X.MACRO_MADDIE if maddie else X.MACRO)
        check_len(f"{sheet} phase", macro, True)
        vol = cells_after(X.VOLUME_MADDIE if maddie else X.VOLUME)
        inten = cells_after(X.INTENSITY_MADDIE if maddie else X.INTENSITY)
        phy = cells_after(X.PHYSICAL_PCT_MADDIE if maddie else X.PHYSICAL_PCT)
        tec = cells_after(X.TECHNIQUE_PCT_MADDIE if maddie else X.TECHNIQUE_PCT)
        tac = cells_after(X.TACTICAL_PCT)
        men = cells_after(X.MENTAL_PCT)
        ses = cells_after(X.SESS[sheet])
        for lbl, v in [("volume", vol), ("intensity", inten), ("sessions", ses)]:
            check_len(f"{sheet} {lbl}", v, True)

        weeks = []
        for w in range(1, WEEKS + 1):
            i = w - 1
            if w <= EXCEL_WEEKS:
                raw_phase = macro[i]
                phase = PHASE.get(raw_phase)
                if phase is None:
                    problems.append(f"{sheet} week {w}: unknown phase '{raw_phase}'")
                g = lambda arr: num(arr[i]) if i < len(arr) else None  # noqa: E731
                weeks.append(dict(w=w, phase=phase, vol=g(vol), int_=g(inten), phy=g(phy),
                                  tec=g(tec), tac=g(tac), men=g(men), ses=g(ses)))
            else:
                weeks.append(dict(w=w, phase="Transition", vol=None, int_=None, phy=None,
                                  tec=None, tac=None, men=None, ses=None))

        # Events (per athlete)
        comps = cells_after(X.COMPS_MADDIE if maddie else X.COMPS)
        prio = cells_after(X.PRIORITY)
        events = []
        for i, label in enumerate(comps):
            if not label:
                continue
            w = i + 1
            kind = "testing" if label == "Testing" else "break" if label == "Xmas" else \
                "camp" if "Camp" in label else "competition"
            p = prio[i] if i < len(prio) and prio[i] else None
            clean = label.replace(" (L)", "")
            events.append(dict(w=w, name={"National": "Nationals", "CAD Open": "Canada Open",
                                          "Xmas": "Christmas Break"}.get(clean, clean),
                               kind=kind, priority=p, tentative=label == "Portugal Open"))
        for i, p in enumerate(prio):
            if p and not (i < len(comps) and comps[i]):
                problems.append(f"{sheet}: priority '{p}' in week {i + 1} has no event next to it")
        # New events decided in chat
        events.append(dict(w=22, name="Peak Performance Camp (USA)", kind="camp", priority=None, tentative=False))
        portugal = next(e["w"] for e in events if e["name"] == "Portugal Open")
        events.append(dict(w=portugal, name="Galeb Camp (Serbia)", kind="camp", priority=None, tentative=True))

        # Skill rows
        rows = []
        phys_rows = [("Aerobic Stamina", X.AEROBIC), ("Flexibility" if sheet == "Audrey" else "Speed",
                      X.FLEXIBILITY if sheet == "Audrey" else (X.SPEED_DAVID if sheet == "David" else X.SPEED)),
                     ("Strength Endurance", X.STRENGTH_END)]
        for rname, line in phys_rows:
            vals = cells_after(line)
            check_len(f"{sheet} {rname}", vals, rname != "Strength Endurance")
            rows.append(("physical", rname, {i + 1: v.upper() for i, v in enumerate(vals) if v}))
        for area in ("technical", "tactical", "mental"):
            for rname, pat in X.SKILLS[sheet][area]:
                vals = pattern_cells(pat)
                check_len(f"{sheet} {rname}", vals, False)
                if area == "mental":
                    cells = {i + 1: "X" for i, v in enumerate(vals) if v}
                else:
                    cells = {i + 1: SKILL_CODE[v.lower()] for i, v in enumerate(vals) if v}
                rows.append((area, rname, cells))

        # Percent sums
        for wk in weeks[:EXCEL_WEEKS]:
            parts = [wk[k] for k in ("phy", "tec", "tac", "men")]
            if any(p is not None for p in parts):
                s = sum(p or 0 for p in parts)
                if abs(s - 100) > 0.01 and s != 0:
                    problems.append(f"{sheet} week {wk['w']}: performance factors add up to {qn(s)}%")

        summary[sheet] = dict(name=name, rows=len(rows), cells=sum(len(c) for _, _, c in rows),
                              events=[(e["w"], e["name"]) for e in events])

        # ── SQL ────────────────────────────────────────────────
        a = f"(select id from hp_athletes where sheet_name = {q(sheet)})"
        p = f"(select id from ytp_plans where athlete_id = {a} and season_id = (select id from ytp_seasons where name = '2026-27'))"
        out.append(f"\n-- ── {name} ({sheet} sheet) ──")
        out.append(f"insert into hp_athletes (sheet_name, display_name, category, level) values "
                   f"({q(sheet)}, {q(name)}, {q(category)}, {q(level)}) on conflict (sheet_name) do nothing;")
        out.append(f"insert into ytp_plans (athlete_id, season_id) select {a}, id from ytp_seasons where name = '2026-27' "
                   f"on conflict (athlete_id, season_id) do nothing;")
        vals = ",\n  ".join(
            f"({p}, {wk['w']}, '{week_start(wk['w'])}', {q(wk['phase'])}, {qn(wk['vol'])}, {qn(wk['int_'])}, "
            f"{qn(wk['phy'])}, {qn(wk['tec'])}, {qn(wk['tac'])}, {qn(wk['men'])}, {qn(wk['ses'])})"
            for wk in weeks)
        out.append("insert into ytp_weeks (plan_id, week_no, week_start, phase, volume_pct, intensity_pct, "
                   "physical_pct, technique_pct, tactical_pct, mental_pct, sessions_planned) values\n  "
                   + vals + "\non conflict (plan_id, week_no) do nothing;")
        for e in events:
            out.append(f"insert into ytp_events (plan_id, week_no, name, kind, priority, tentative) "
                       f"select {p}, {e['w']}, {q(e['name'])}, {q(e['kind'])}, {q(e['priority'])}, {str(e['tentative']).lower()} "
                       f"where not exists (select 1 from ytp_events where plan_id = {p} and week_no = {e['w']} and name = {q(e['name'])});")
        for sort, (area, rname, cells) in enumerate(rows, start=1):
            out.append(f"insert into ytp_rows (plan_id, area, name, sort) values ({p}, {q(area)}, {q(rname)}, {sort}) "
                       f"on conflict (plan_id, area, name) do nothing;")
            if cells:
                r = f"(select id from ytp_rows where plan_id = {p} and area = {q(area)} and name = {q(rname)})"
                cv = ", ".join(f"({w}, {q(c)})" for w, c in sorted(cells.items()))
                out.append(f"insert into ytp_cells (row_id, week_no, code) select {r}, v.w, v.c from (values {cv}) as v(w, c) "
                           f"on conflict (row_id, week_no) do nothing;")
    return out, summary


if __name__ == "__main__":
    lines, summary = build()
    header = ("-- YTP seed data: 4 HP athletes from \"Ytp 2027.xlsx\" (season 2026-27, 52 weeks).\n"
              "-- Generated by scripts/ytp/build_seed.py — safe to run more than once.\n"
              "-- Run AFTER 044_ytp.sql.\n\n"
              "insert into ytp_seasons (name, start_date, weeks) values ('2026-27', '2026-09-07', 52) "
              "on conflict (name) do nothing;\n")
    path = os.path.join(os.path.dirname(__file__), "..", "..", "supabase", "migrations", "045_ytp_seed.sql")
    with open(path, "w") as f:
        f.write(header + "\n".join(lines) + "\n")
    print(json.dumps(summary, indent=1))
    print("\nPROBLEMS:" if problems else "\nNo problems found.")
    for p in problems:
        print(" -", p)
