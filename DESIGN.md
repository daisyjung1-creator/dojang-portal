---
name: Champion Hankook Taekwondo — Dojang Portal
description: Admin, staff-iPad, and parent portal for Champion Hankook Taekwondo, Edmonton.
colors:
  ink: "#20241F"
  ink-soft: "#5B5F56"
  ink-faint: "#8A8D84"
  paper: "#FFFFFF"
  canvas: "#F6F5F2"
  line: "#E2DFD6"
  hankook-red: "#BE1C21"
  hankook-red-deep: "#9A2B2B"
  hp-orange: "#E8701A"
  success: "#2A5A30"
  success-tint: "#E8F1E9"
  warning: "#854F0B"
  warning-tint: "#FAEEDA"
  danger-tint: "#FBEAEA"
  info: "#1E4566"
typography:
  display:
    fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
  headline:
    fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.3
  caption:
    fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  sm: "6px"
  md: "10px"
  lg: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "38px"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "38px"
  button-danger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.hankook-red-deep}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    height: "38px"
  button-touch:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
    height: "38px"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "16px 20px"
  badge-alert:
    backgroundColor: "{colors.hankook-red}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    height: "18px"
---

# Design System: Champion Hankook Taekwondo — Dojang Portal

## Overview

**Creative North Star: "The Dojang Floor"**

A clean training floor: white mats, black lines, one red mark that tells you where to look. The portal is a working tool used every day by Master Daisy (desktop), by staff on the dojang iPad (attendance, trials, tapes), and by parents on their phones. It should feel calm, exact, and disciplined, like a well-run class, not like a marketing site.

Brand truth comes from the dojang itself: a red logo set in Helvetica, black-and-white merch, red used sparingly as an accent. The High Performance program has its own orange.

All interface copy is English. Parent-facing messages are signed "Master Daisy".

Surfaces and their mode:
- **Admin (desktop):** Operate. Dense, scannable tables; restraint.
- **Staff iPad (kiosk, Today, Trials, Tapes):** Operate, touch-first. Big targets, readable from arm's length.
- **Parent portal and online registration (phones):** Operate, with a little more warmth. This is where the dojang's brand shows most.

## Colors

The palette is ink on white with one red. Status colors exist only to report state, never to decorate.

### Primary
- **Hankook Red** (#BE1C21): the logo red. Notification badges, the active nav marker, the logo, and at most one emphasis per screen. Never a large fill. *(Confirm against the logo file.)*

### Secondary
- **HP Orange** (#E8701A): High Performance / Comp Team surfaces only (HP badges, YTP pages). Never mixed with Hankook Red on one element. *(Confirm against the HP logo / team colour.)*

### Neutral
- **Ink** (#20241F): body text, headings, primary buttons, the kiosk header bar.
- **Ink Soft** (#5B5F56): supporting text, secondary labels.
- **Ink Faint** (#8A8D84): hints, metadata, placeholders only. Never for text a user must read to act.
- **Paper** (#FFFFFF): cards, tables, inputs.
- **Canvas** (#F6F5F2): the page behind cards. Slightly warm, close to white.
- **Line** (#E2DFD6): borders and dividers.

### Status
- **Success** (#2A5A30 on #E8F1E9): present, paid, completed.
- **Warning** (#854F0B on #FAEEDA): excused, makeup open, due soon.
- **Danger** (#9A2B2B on #FBEAEA): absent, overdue, delete. Always paired with an icon or a word.
- **Info** (#1E4566): links and neutral notices.

### Class colours
Each class has its own chip colour (dark text on a light tint), defined once in `src/lib/classes.js` (`CLASS_COLORS`, `classColor()`):
Beginner green · Intermediate B blue · Beginner/Intermediate teal · Intermediate A purple · Intermediate/Advance pink · Advance Poomsae amber · Advance Sparring red · HP orange · Comp Team charcoal. Always shown with the class name.

### Named Rules
**The One Red Rule.** Hankook Red covers less than 5% of any screen. If two things are red, one of them is wrong.

**The Fifteen Colors Rule.** Only the colors listed above (plus the class colours) are allowed. A new hex value in a component means a new token here first, or it does not ship.

**The Never Color Alone Rule.** Attendance, payment, and belt states always carry a word or icon as well as a color.

## Typography

**Display Font (titles only):** Helvetica — the logo font — taken from the device (Mac / iPad), Helvetica Neue / Arial elsewhere. Used for page titles (h1, h2), the brand name and the kiosk class name.
**Body Font:** the portal's original stack — Pretendard, then the system UI font (-apple-system / BlinkMacSystemFont), Malgun Gothic, Apple SD Gothic Neo.

**Character:** The logo face marks the important titles; long reading (tables, forms, lists) stays in the calmer system body font.

### Hierarchy
- **Display** (700, 28px, 1.15): page totals and big numbers on Home and Reports.
- **Headline** (700, 20px, 1.25): page titles.
- **Title** (600, 16px, 1.3): card and modal titles, student names on tiles.
- **Body** (400, 14px, 1.5): tables, forms, descriptions.
- **Label** (500, 13px, 1.3): buttons, field labels, chips.
- **Caption** (400, 12px, 1.35): timestamps and metadata only.

### Named Rules
**The Six Sizes Rule.** Only these six sizes. No 10.5, 11.5, 12.5, 13.5 or 14.5.

**The Arm's Length Rule.** On touch surfaces (kiosk, Today, parent portal) nothing a user must read is under 13px, and body text is 16px.

## Layout

Desktop admin: left sidebar plus a content column of cards and tables. Below 820px the sidebar becomes a drawer behind a top bar. Spacing steps are 4 / 8 / 12 / 20 / 32px; card padding 16–20px; table rows at least 40px tall.

iPad kiosk: full-screen, tile grid (`minmax(170px, 1fr)`), header with the class and the "here / expected" count, footer with secondary actions. Keep the bottom-right corner clear of the Netlify badge.

Navigation groups: see Components → Navigation.

## Elevation & Depth

Flat. Depth comes from Paper cards on Canvas with a 1px Line border. The only shadows are on overlays (modals, drawer) to separate them from the page.

## Shapes

Small, firm corners: 6px for controls, 10px for touch buttons, 12px for cards and tiles, pill only for badges and status chips. 1px borders throughout; 2px borders only on kiosk tiles to show state.

## Components

### Buttons
- **Shape:** 6px radius; 38px tall on desktop, 44px on touch surfaces.
- **Primary:** Ink fill, white text. One per view.
- **Secondary:** white with a Line border. The default button.
- **Danger:** white with Hankook Red Deep text, filled only inside the final confirm step.
- **Disabled:** avoid; keep buttons active and explain on tap.

### Status chips
- Tint background plus the deep text of the same color (see Status). Pill shape, Label size, always with a word.

### Cards / Containers
- 12px radius, Paper background, 1px Line border, no shadow, 16–20px padding.

### Inputs
- 38px tall, 6px radius, Line border; focus changes the border to Ink with a visible 2px focus ring.

### Navigation
- Sidebar (ink background): items 14px, light grey text; the active item gets white bold text, a soft white tint and a Hankook Red icon (no side stripe). Counts show as red badges.
- Admin groups, each with a small plain heading: Home · People (Students, Leads & Trials, Enrollment, Email) · Classes (Attendance, Belt Testing, Events) · Money (Billing, Invoices, Payments, Customers, Sales & GST) · Admin (Payroll, Inventory, Invoice Settings, Staff Logins). Staff see only Today, Trials, Attendance, Tapes.

### Belt strip (signature component)
One shared `<BeltStrip belt="..." />` used everywhere a rank appears (kiosk, student list, belt testing, parent portal). It replaces every other belt chip or color bar.
- **Shape:** a plain horizontal belt band, no knot or tails. Aspect ratio 72:14, 2.5px corner radius, 1.5px border in the belt's edge color. Sizes: 44px wide in tables, 52px in lists, 64px on kiosk tiles and the parent portal.
- **Solid belts** (White, Yellow, Green, Blue, Red): the belt color fills the band. White keeps its grey edge so it shows on white surfaces.
- **Stripe belts** (Yellow, Green, Blue, Red Stripe): the band is the lower belt's color with a lengthwise stripe of the next belt's color through the middle (stripe height about 30% of the band).
- **Black Stripe 0–4:** red band with a black lengthwise stripe; stripe number 1–4 shown as that many thin gold (#D4AF37) bars at the right end.
- **Black Belt 1st–3rd Dan:** black band with a gold border; dan number shown as that many gold bars at the left end.
- **Label:** always paired with the belt name in text, or an `aria-label` with the full rank name, so the rank never depends on color alone.
- Colors come from the existing `BELTS` table in `src/lib/constants.js`.

### Kiosk tile (signature component)
- Whole tile = tap to mark present (toggle, with an Undo toast).
- Belt shown with the Belt strip (64px) plus the belt name.
- Secondary actions (Excused) are a separate 44px zone at the bottom of the tile, never a small chip inside the tap area.

## Do's and Don'ts

**Do**
- Use Ink buttons and white surfaces; let the one red mark carry the brand.
- Put every color, size, and radius through the tokens above.
- Confirm destructive actions with the portal's own ConfirmDialog.
- Keep touch targets 44px or more on the iPad and parent portal.

**Don't**
- Don't fill large areas with red (walls of red read as tacky).
- Don't use the browser's `window.confirm` or `alert`.
- Don't put a tappable chip inside another tappable area.
- Don't add new hex colors or in-between font sizes inside components.
- Don't use Korean in the interface.
