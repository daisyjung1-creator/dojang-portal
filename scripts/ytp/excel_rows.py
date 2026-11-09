# Rows copied from "Ytp 2027.xlsx" (one tab-separated line per Excel row).
# Column A = label, column B = sub-label, column C onward = weeks 1..48
# (week 1 starts Monday 2026-09-07).

COMPS = "Comps/Camps (L,P,C)\t\t\t\t\tK.H.Min (L)\tConsul Cup\t\t\t\t\tCalgary Open\t\tTeam AB Camps\t\t\tTesting\tXmas\tXmas\tTesting\t\t\t\t\t\t\t\tNational \tCAD Open \t\t\tTesting\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tPortugal Open"
COMPS_MADDIE = "Comps/Camps (L,P,C)\t\tTesting\t\t\tK.H.Min (L)\tConsul Cup\t\t\t\t\tCalgary Open\t\tTeam AB Camps\t\t\tTesting\tXmas\tXmas\tTesting\t\t\t\t\t\t\t\tNational \tCAD Open \t\t\tTesting\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tPortugal Open"
PRIORITY = " Priority \tRank L/M/H\t\tL\t\tL\tL\t\t\t\t\t\t\tM\t\t\t\t\t\t\t\t\t\t\t\t\t\tH\t\tM\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tH"

_MACRO_TAIL = "\tGeneral Prep\tGeneral Prep\tGeneral Prep\tGeneral Prep\tSpecific Prep\tSpecific Prep\tSpecific Prep\tSpecific Prep\tSpecific Prep\tSpecific Prep\tSpecific Prep\tPre-Comp \tPre-Comp \tPre-Comp \tBreak\tBreak\tPre-Comp \tPre-Comp \tComp \tComp \tComp \tComp \tComp \tTaper\tPeak\tComp \tTransition\tTransition\tGeneral Prep\tGeneral Prep\tGeneral Prep\tGeneral Prep\tGeneral Prep\tSpecific Prep\tSpecific Prep\tSpecific Prep\tSpecific Prep\tPre-Comp \tPre-Comp \tPre-Comp \tComp \tComp \tComp \tTaper\tPeak\tTransition\tTransition"
MACRO = "Periodization\tMacroCycle\tTransition" + _MACRO_TAIL
MACRO_MADDIE = "Periodization\tMacroCycle\tGeneral Prep" + _MACRO_TAIL

_VOL_TAIL = "\t80.0\t80.0\t80.0\t80.0\t70.0\t70.0\t70.0\t70.0\t70.0\t70.0\t70.0\t60.0\t60.0\t50.0\t0.0\t0.0\t60.0\t50.0\t40.0\t40.0\t30.0\t20.0\t20.0\t10.0\t10.0\t0.0\t0.0\t\t80.0\t80.0\t80.0\t80.0\t80.0\t70.0\t70.0\t60.0\t60.0\t60.0\t50.0\t40.0\t30.0\t20.0\t20.0\t10.0\t10.0\t0.0\t0.0"
_INT_TAIL = "\t20.0\t20.0\t20.0\t20.0\t30.0\t30.0\t30.0\t30.0\t30.0\t30.0\t30.0\t40.0\t40.0\t50.0\t0.0\t0.0\t40.0\t50.0\t60.0\t60.0\t70.0\t80.0\t80.0\t90.0\t90.0\t0.0\t0.0\t\t20.0\t20.0\t20.0\t20.0\t20.0\t30.0\t30.0\t40.0\t40.0\t40.0\t50.0\t60.0\t70.0\t80.0\t80.0\t90.0\t90.0\t0.0\t0.0"
_PHY_TAIL = "\t80.0\t70.0\t70.0\t60.0\t60.0\t60.0\t50.0\t40.0\t30.0\t20.0\t20.0\t20.0\t20.0\t20.0\t\t\t20.0\t20.0\t20.0\t20.0\t20.0\t20.0\t20.0\t10.0\t10.0\t\t\t\t80.0\t70.0\t60.0\t60.0\t50.0\t40.0\t40.0\t40.0\t30.0\t30.0\t30.0\t30.0\t25.0\t20.0\t10.0\t15.0\t10.0"
_TEC_TAIL = "\t20.0\t30.0\t30.0\t30.0\t30.0\t30.0\t40.0\t40.0\t50.0\t50.0\t40.0\t40.0\t30.0\t45.0\t\t\t30.0\t15.0\t25.0\t25.0\t15.0\t10.0\t5.0\t5.0\t5.0\t\t\t\t10.0\t20.0\t20.0\t20.0\t20.0\t10.0\t20.0\t10.0\t20.0\t20.0\t20.0\t20.0\t30.0\t20.0\t20.0\t5.0\t5.0"
TACTICAL_PCT = "\tTactical/Stratagy\t0.0\t0.0\t0.0\t0.0\t10.0\t0.0\t10.0\t10.0\t10.0\t10.0\t20.0\t30.0\t35.0\t30.0\t30.0\t\t\t45.0\t45.0\t45.0\t45.0\t45.0\t40.0\t35.0\t45.0\t45.0\t\t\t\t0.0\t10.0\t20.0\t20.0\t30.0\t30.0\t40.0\t30.0\t50.0\t50.0\t50.0\t50.0\t35.0\t40.0\t40.0\t40.0\t35.0"
MENTAL_PCT = "\tMental \t0.0\t0.0\t0.0\t0.0\t0.0\t10.0\t0.0\t0.0\t10.0\t10.0\t10.0\t10.0\t5.0\t20.0\t5.0\t\t\t5.0\t20.0\t10.0\t10.0\t20.0\t30.0\t40.0\t40.0\t40.0\t\t\t\t10.0\t0.0\t0.0\t0.0\t0.0\t20.0\t0.0\t20.0\t\t\t\t\t10.0\t20.0\t30.0\t40.0\t50.0"

def _pct(label, first, tail):
    return "\t" + label + "\t" + first + tail

VOLUME = _pct("volume (%)", "0.0", _VOL_TAIL)
VOLUME_MADDIE = _pct("volume (%)", "80.0", _VOL_TAIL)
INTENSITY = _pct("intensity (%)", "0.0", _INT_TAIL)
INTENSITY_MADDIE = _pct("intensity (%)", "20.0", _INT_TAIL)
PHYSICAL_PCT = _pct("Physical", "0.0", _PHY_TAIL)
PHYSICAL_PCT_MADDIE = _pct("Physical", "80.0", _PHY_TAIL)
TECHNIQUE_PCT = _pct("Technique", "0.0", _TEC_TAIL)
TECHNIQUE_PCT_MADDIE = _pct("Technique", "20.0", _TEC_TAIL)

_SESS_TAIL = "\t10.0\t13.0\t8.0\t13.0\t13.0\t13.0\t13.0\t13.0\t6.0\t6.0\t13.0\t13.0\t13.0\t13.0\t13.0\t13.0\t11.0\t13.0\t1.0\t2.0\t0.0\t8.0\t10.0\t13.0\t13.0\t13.0\t8.0\t13.0\t13.0\t11.0\t13.0\t13.0\t13.0\t13.0\t11.0\t11.0\t13.0\t6.0\t1.0\t0.0\t0.0"
SESS = {
    "Audrey": "\tsess/week\t0.0\t13.0\t10.0\t6.0\t8.0\t10.0\t8.3" + _SESS_TAIL,
    "Maddie": "\tsess/week\t0.0\t13.0\t10.0\t6.0\t4.0\t10.0\t12.7" + _SESS_TAIL,
    "Daniel": "\tsess/week\t0.0\t13.0\t10.0\t6.0\t8.0\t10.0\t11.75" + _SESS_TAIL,
    "David": "\tsess/week\t0.0\t13.0\t10.0\t6.0\t8.0\t10.0\t9.3" + _SESS_TAIL,
}

AEROBIC = "Physical\tAerobic Stamina\t\t\t\t\tD\tD\tD\tD\tD\tD\tM\tM\tM\tM\tM\t\t\tD\tD\tD\tD\tM\tM\tM\tM\t\t\t\t\tD\tD\tD\tD\tD\tD\tD\tM\tM\tM\tM\tM\tM\tM\tM\tM"
FLEXIBILITY = "\tFlexibility\t\t\t\t\t\tD\tD\tD\tM\tM\tM\tM\tM\tM\tM\t\t\tM\tM\tM\tM\tM\tM\tM\tM\t\t\t\t\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM"
_SPEED_TAIL = "\tM\tM\tM\tM\tM\tM\t\t\tM\tM\tM\tM\tM\tM\tM\tM\t\t\t\t\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM\tM"
SPEED = "\tSpeed\t\t\t\t\t\t\t\tD\tM" + _SPEED_TAIL
SPEED_DAVID = "\tSpeed\t\t\t\t\t\t\t\tD\tD" + _SPEED_TAIL
STRENGTH_END = "\tStrength endurance\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tD\tD\tD\tD\tM\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tD\tD\tD\tD\tM"

# Skill patterns (codes as in Excel: a / c / r)
P_REVERSE = "\t\t\t\t\ta\ta\ta\ta\ta\tc\tc\tc\tc\tc\t\t\tc\tc\tc\tc\tc\tc\tc\tr"
P_CHOP = "\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\ta\ta\ta\tc\tc\tc\tc\tc\tc\tc\tc\tc\tc\tc\tc\tc"
P_BACKLEG = "\t\t\t\t\t\t\t\t\t\tc\tc\tc\tc\tc\t\t\tc\tc\tc\tc\tr\tr\tr\tr"
P_CANCEL_TAC = "\t\t\t\t\t\t\t\t\t\t\t\t\ta\ta\ta\t\t\tc\tc\tc\tc\tc\tc\tc\tr\tr"
P_CHECKING = "\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\ta\ta\ta\ta\tc\tc\tc\tc\tc\tc\tc\tc\tc\tr\tr"
P_TIMING = "\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tc\tc\tc\tc\tr\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tc\tc\tc\tr\tr"
P_VIS_AUDREY = "\t\t\t\t\t\t\tX\tx\tx\t\t\t\tx\t\t\t\t\tx\t\t\t\tx\tx\tx\tx\t\t\t\t\t\t\t\t\tx\t\tx\t\t\t\t\tx\tx\tx\tx\tx"
P_AROUSAL = "\t\t\t\t\t\tx\t\tx\tx\t\t\t\tx\t\t\t\t\tx\t\t\t\tx\tx\tx\tx\t\t\t\t\t\t\t\t\tx\t\tx\t\t\t\t\tx\tx\tx\tx\tx"
P_GOAL = "\t\t\t\t\t\t\t\t\t\t\t\tx\t\t\t\t\t\t\tx\t\t\t\tx\t\t\t\t\t\tx"
# Maddie-only
P_M_CHOP = "\t\t\t\t\tc\tc\tc\tc\tc\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\ta\ta\ta\tc\tc\tc\tc\tc\tc\tc\tc\tc\tc\tc\tc\tc"
P_M_BACKLEG = "\t\t\t\t\tc\tc\tc\tc\tc\tr\tr\tr\t\t\t\t\tr\tr\tr\tr\tr\tr\tr\tr"
P_M_CANCEL = "\t\t\t\t\ta\ta\ta\ta\ta"
P_M_CHECKREAD = "\t\t\t\t\ta\ta\ta\ta\ta\tc\tc\tc\tc\tc\t\t\tc\tc\tc\tc\tc\tc\tc\tr\tr"
P_M_FOLLOW = "\t\t\t\t\tc\tc\tc\tc\tc\tc\tc\tc\tc\tc\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\ta\ta\ta\ta\tc\tc\tc\tc\tc\tc\tc\tc\tc\tr\tr"

# Each pattern string starts right after the label cell (column B),
# so the first tab-separated value is column C = week 1.
def row(pattern):
    return pattern

SKILLS = {
    "Audrey": {
        "technical": [("Reverse Kick", P_REVERSE), ("Chop Kick", P_CHOP), ("Back Leg RHK", P_BACKLEG)],
        "tactical": [("Cancel", P_CANCEL_TAC), ("Checking", P_CHECKING), ("Timing", P_TIMING)],
        "mental": [("Visualization", P_VIS_AUDREY), ("Optimal Arousal Level", P_AROUSAL), ("Goal Setting", P_GOAL)],
    },
    "Maddie": {
        "technical": [("Reverse Kick", P_REVERSE), ("Chop Kick", P_M_CHOP), ("Back Leg RHK", P_M_BACKLEG), ("Cancel", P_M_CANCEL)],
        "tactical": [("Checking/Reading", P_M_CHECKREAD), ("Follow Up", P_M_FOLLOW)],
        "mental": [("Visualization", P_AROUSAL), ("Optimal Arousal Level", P_AROUSAL), ("Goal Setting", P_GOAL)],
    },
    "Daniel": {
        "technical": [("Left Twist", P_REVERSE), ("Cancel", P_CHOP), ("Tornado Kick", P_BACKLEG)],
        "tactical": [("Follow Up", P_CANCEL_TAC), ("Leading", P_CHECKING)],
        "mental": [("Visualization", P_AROUSAL), ("Optimal Arousal Level", P_AROUSAL), ("Goal Setting", P_GOAL)],
    },
    "David": {
        "technical": [("Double", P_REVERSE), ("Roundhouse Kick", P_CHOP), ("Cancel", P_BACKLEG), ("Tornado", "")],
        "tactical": [("Ring Management", P_CANCEL_TAC), ("Checking", P_CHECKING), ("Distance Control", P_TIMING), ("Reading Que", "")],
        "mental": [("Visualization", P_AROUSAL), ("Optimal Arousal Level", P_AROUSAL), ("Goal Setting", P_GOAL)],
    },
}
