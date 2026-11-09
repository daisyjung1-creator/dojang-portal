"""Builds supabase/migrations/045_ytp_seed.sql straight from the YTP Excel file.

Run:  python3 scripts/ytp/build_seed.py path/to/Ytp_2027.xlsx

The Excel file itself is NOT stored in the repo (it has athletes' personal plans).
"""
import datetime as dt
import json
import os
import sys

import openpyxl

SEASON_START = dt.date(2026, 9, 7)
WEEKS = 52
FIRST_WEEK_COL = 3  # column C = week 1

# Weeks 50-52 in the Excel are "General Prep" for next season.
# "excel" keeps them as they are (coach's decision); "transition" turns them into Transition weeks.
LAST_WEEKS_MODE = "excel"

ATHLETES = [
    # sheet, display name, category, level  (row 1 of every sheet says "Winter Somoso, Cadet F-47kg"; corrected in chat)
    ("Audrey", "Winter Somoso", "Cadet Female -47kg", "National"),
    ("Maddie", "Maddie Harbinson", "Junior Female -52kg", "National"),
    ("Daniel", "Daniel Esguerra", "Junior Male -49kg", "National"),
    ("David", "David Sanmor", "Junior Male -73kg", "National"),
]
NAME_FIXES = {"Left Tiwst": "Left Twist", "Disrance Control": "Distance Control",
              "Round House Kick": "Roundhouse Kick", "Follow up": "Follow Up",
              "Optimal arousal level": "Optimal Arousal Level", "Strength endurance": "Strength Endurance"}
SKILL_CODE = {"a": "D", "c": "C", "r": "R", "i": "I", "d": "D"}
PHASE = {"General Prep": "General Prep", "Specific Prep": "Specific Prep", "Pre-Comp": "Pre-Competition",
         "Comp": "Competition", "Taper": "Taper", "Peak": "Peak", "Transition": "Transition", "Break": "Break"}
EVENT_NAMES = {"National": "Nationals", "CAD Open": "Canada Open", "Xmas": "Christmas Break"}

problems = []


def s(v):
    return v.strip() if isinstance(v, str) else v


def week_values(ws, row):
    return [s(ws.cell(row, FIRST_WEEK_COL + i).value) for i in range(WEEKS)]


def find_row(ws, label, col=2, start=1):
    for r in range(start, 60):
        v = ws.cell(r, col).value
        if isinstance(v, str) and v.strip().lower().startswith(label.lower()):
            return r
    raise KeyError(f"{ws.title}: row '{label}' not found")


def num(v):
    return None if v in (None, "") else float(v)


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def qn(v):
    if v is None:
        return "null"
    return str(int(v)) if float(v).is_integer() else str(v)


def week_start(w):
    return SEASON_START + dt.timedelta(days=7 * (w - 1))


def skill_rows(ws, sheet):
    """physical / technical / tactical / mental rows, by walking down from 'Aerobic Stamina'."""
    areas = ["physical", "technical", "tactical", "mental"]
    area_i = 0
    rows = []
    start = find_row(ws, "Aerobic Stamina")
    end = find_row(ws, "Loading", col=1)
    for r in range(start, end):
        c3 = ws.cell(r, FIRST_WEEK_COL).value
        if isinstance(c3, str) and "Skills" in c3:  # section header row
            area_i += 1
            continue
        name = s(ws.cell(r, 2).value)
        vals = week_values(ws, r)
        if not name and not any(vals):
            continue
        if not name:
            continue  # rows with codes but no skill name are dropped (coach's decision)
        area = areas[area_i]
        cells = {}
        for i, v in enumerate(vals):
            if not v:
                continue
            w = i + 1
            if area == "physical":
                code = v.upper()
                if code not in ("D", "M"):
                    problems.append(f"{sheet} {name} week {w}: unexpected '{v}'")
                    continue
            elif area == "mental":
                code = "X"
            else:
                code = SKILL_CODE.get(v.lower())
                if code is None:
                    problems.append(f"{sheet} {name} week {w}: unexpected '{v}'")
                    continue
            cells[w] = code
        rows.append((area, NAME_FIXES.get(name, name), cells))
    return rows


def build(xlsx):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    out, summary = [], {}
    for sheet, name, category, level in ATHLETES:
        ws = wb[sheet]
        dates = week_values(ws, find_row(ws, "Monday Date", col=1))
        for i, d in enumerate(dates):
            if d is not None and d.date() != week_start(i + 1):
                problems.append(f"{sheet} week {i + 1}: date {d.date()} != {week_start(i + 1)}")
        macro = week_values(ws, find_row(ws, "MacroCycle"))
        loading = find_row(ws, "Loading", col=1)
        series = {k: week_values(ws, find_row(ws, label, start=loading)) for k, label in [
            ("vol", "volume"), ("int_", "intensity"), ("phy", "Physical"), ("tec", "Technique"),
            ("tac", "Tactical/Strat"), ("men", "Mental"), ("hrs", "sess/week")]}
        weeks = []
        for i in range(WEEKS):
            w = i + 1
            phase = PHASE.get(macro[i])
            if phase is None:
                problems.append(f"{sheet} week {w}: unknown phase '{macro[i]}'")
            wk = dict(w=w, phase=phase, **{k: num(v[i]) for k, v in series.items()})
            if LAST_WEEKS_MODE == "transition" and w >= 50:
                wk = dict(w=w, phase="Transition", vol=None, int_=None, phy=None, tec=None, tac=None, men=None, hrs=None)
            parts = [wk[k] for k in ("phy", "tec", "tac", "men")]
            tot = sum(p or 0 for p in parts)
            if any(p is not None for p in parts) and tot not in (0, 100):
                problems.append(f"{sheet} week {w}: performance factors add up to {qn(tot)}%")
            weeks.append(wk)

        comps = week_values(ws, find_row(ws, "Comps", col=1))
        prio = week_values(ws, find_row(ws, "Rank"))
        events = []
        for i, label in enumerate(comps):
            if not label:
                continue
            kind = "testing" if label == "Testing" else "break" if label == "Xmas" else \
                "camp" if "Camp" in label else "competition"
            clean = label.replace(" (L)", "")
            events.append(dict(w=i + 1, name=EVENT_NAMES.get(clean, clean), kind=kind,
                               priority=prio[i] or None, tentative=label == "Portugal Open"))
        # Priorities with no event in the same week (weeks 2 and 28) are left out — confirmed by the coach.
        events.append(dict(w=22, name="Peak Performance Camp (USA)", kind="camp", priority=None, tentative=False))
        portugal = next(e["w"] for e in events if e["name"] == "Portugal Open")
        events.append(dict(w=portugal, name="Galeb Camp (Serbia)", kind="camp", priority=None, tentative=True))

        rows = skill_rows(ws, sheet)
        if LAST_WEEKS_MODE == "transition":
            rows = [(a, n, {w: c for w, c in cells.items() if w < 50}) for a, n, cells in rows]
        summary[sheet] = {"name": name, "rows": [f"{a}: {n} ({len(c)})" for a, n, c in rows],
                          "events": len(events)}

        a = f"(select id from hp_athletes where sheet_name = {q(sheet)})"
        p = (f"(select id from ytp_plans where athlete_id = {a} and season_id = "
             f"(select id from ytp_seasons where name = '2026-27'))")
        out.append(f"\n-- ── {name} ({sheet} sheet) ──")
        out.append(f"insert into hp_athletes (sheet_name, display_name, category, level) values "
                   f"({q(sheet)}, {q(name)}, {q(category)}, {q(level)}) on conflict (sheet_name) do nothing;")
        out.append(f"insert into ytp_plans (athlete_id, season_id) select {a}, id from ytp_seasons "
                   f"where name = '2026-27' on conflict (athlete_id, season_id) do nothing;")
        vals = ",\n  ".join(
            f"({p}, {wk['w']}, '{week_start(wk['w'])}', {q(wk['phase'])}, {qn(wk['vol'])}, {qn(wk['int_'])}, "
            f"{qn(wk['phy'])}, {qn(wk['tec'])}, {qn(wk['tac'])}, {qn(wk['men'])}, {qn(wk['hrs'])})" for wk in weeks)
        out.append("insert into ytp_weeks (plan_id, week_no, week_start, phase, volume_pct, intensity_pct, "
                   "physical_pct, technique_pct, tactical_pct, mental_pct, hours_planned) values\n  "
                   + vals + "\non conflict (plan_id, week_no) do nothing;")
        for e in events:
            out.append(f"insert into ytp_events (plan_id, week_no, name, kind, priority, tentative) "
                       f"select {p}, {e['w']}, {q(e['name'])}, {q(e['kind'])}, {q(e['priority'])}, "
                       f"{str(e['tentative']).lower()} where not exists (select 1 from ytp_events where "
                       f"plan_id = {p} and week_no = {e['w']} and name = {q(e['name'])});")
        for sort, (area, rname, cells) in enumerate(rows, start=1):
            out.append(f"insert into ytp_rows (plan_id, area, name, sort) values ({p}, {q(area)}, {q(rname)}, {sort}) "
                       f"on conflict (plan_id, area, name) do nothing;")
            if cells:
                r = f"(select id from ytp_rows where plan_id = {p} and area = {q(area)} and name = {q(rname)})"
                cv = ", ".join(f"({w}, {q(c)})" for w, c in sorted(cells.items()))
                out.append(f"insert into ytp_cells (row_id, week_no, code) select {r}, v.w, v.c from "
                           f"(values {cv}) as v(w, c) on conflict (row_id, week_no) do nothing;")
    return out, summary


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: build_seed.py Ytp_2027.xlsx")
    lines, summary = build(sys.argv[1])
    header = ("-- YTP seed data: 4 HP athletes from \"Ytp 2027.xlsx\" (season 2026-27, 52 weeks).\n"
              "-- Generated by scripts/ytp/build_seed.py — safe to run more than once.\n"
              "-- Run AFTER 044_ytp.sql.\n\n"
              "insert into ytp_seasons (name, start_date, weeks) values ('2026-27', '2026-09-07', 52) "
              "on conflict (name) do nothing;\n")
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "supabase", "migrations", "045_ytp_seed.sql")
    with open(path, "w") as f:
        f.write(header + "\n".join(lines) + "\n")
    print(json.dumps(summary, indent=1))
    print("\nPROBLEMS:" if problems else "\nNo problems found.")
    for p in problems:
        print(" -", p)
