# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Master Daisy (admin), desktop.** Owner of Champion Hankook Taekwondo. Runs everything in the portal: students, leads and trials, enrollment, attendance, belt testing, events, billing, invoicing, payments, Sales & GST, payroll, inventory, email. Needs to see a lot at once and move fast.
- **Staff, on the dojang iPad (and a dojang computer).** One shared staff login. Sees only Today, Attendance (kiosk), Trials and Tapes. Marks attendance during class, often standing, between other tasks, sometimes after the day is over.
- **Parents, on their phones.** Invite-only parent portal with strict per-family access: one or more children, billing and receipts, progress (belt, tapes, classes toward the next test), absence notices, make-up classes, event sign-up, saved cards.
- **New families.** Public online registration and trial pages, filled in on a phone.

## Product Purpose

Run a single taekwondo dojang from one place, replacing spreadsheets, Express Invoice and scattered email. Success means: attendance is taken in seconds on the iPad, every student's billing and belt progress is correct without double entry, and parents can answer their own questions (what's owed, how many classes until the test, which make-ups are open) without emailing the dojang.

## Positioning

Built for this dojang's real rules, not a generic gym tool: per-class schedules, excused-absence make-ups that expire after 30 days and need Master Daisy's approval, belt-test eligibility after 21 classes, curriculum tapes, Black Stripe poomsae by stripe, KidSport and other subsidies, Comp Team and High Performance programs, GST and Canadian invoicing.

## Operating Context

- Dojang: Unit 101B Millbourne Market Mall, Edmonton, Alberta. Time zone America/Edmonton.
- Weekday afternoon and evening classes plus Saturday Comp Team. Some students take two or more classes.
- The iPad sits in the dojang and is used in kiosk mode during class; a Netlify badge sits in the bottom-right corner.
- Belt testing four times a year, with Leaders Club student helpers; no regular classes on test days.
- Closed on all Alberta general and optional holidays, Christmas Eve and New Year's Eve.
- Work flow: changes on the `dev` branch, checked on the Netlify deploy preview, merged to `main` only when Master Daisy says so (each production deploy costs credits).

## Capabilities and Constraints

- React + Vite front end, Supabase back end, deployed on Netlify (`dojang-portal.netlify.app`).
- Roles: admin (full access), shared staff login (Today, Attendance, Trials, Tapes only), parent (own family only), public (registration and trial pages).
- Interface and all parent-facing text are English only.
- Make-ups: only for excused absences, only while enrollment is active, expire 30 days after the absence; Comp Team needs none.
- Saved cards: families can save several; a card can only be removed when the family has two or more.
- Open decision: automatic invoice and receipt email sending will connect to an email account later.

## Brand Commitments

- Name: Champion Hankook Taekwondo. Parent emails signed "Master Daisy".
- Logo is red, set in Helvetica. Brand is mostly black and white with red as a small accent; large red areas are not wanted.
- High Performance program has its own white "High Performance HANKOOK" logo and an orange team color.
- Belt ranks, in order: White, Yellow Stripe, Yellow, Green Stripe, Green, Blue Stripe, Blue, Red Stripe, Red, Black Stripe 0–4, Black Belt 1st–3rd Dan.

## Evidence on Hand

- Logos: `src/assets/logo.png`, `src/assets/logo-mark.png`.
- Real student, attendance and billing data live in Supabase; never copy real names or figures into mockups or docs.
- No testimonials, reviews or marketing claims exist for the portal; do not invent any.

## Product Principles

1. **The rule is the product.** Encode the dojang's real policies (make-ups, eligibility, subsidies, holidays) so nobody has to remember them.
2. **Fast in the room.** Anything staff do during class takes one tap and can be undone.
3. **One source of truth.** Enter a fact once; every screen, invoice and report reads it.
4. **Parents help themselves.** Show families what they need to know before they need to ask.
5. **Private by default.** Staff and parents see only what their role needs.

## Accessibility & Inclusion

- Touch surfaces (iPad kiosk, parent portal, registration) need targets of at least 44px and readable text at arm's length.
- Status (attendance, payment, belt) must never depend on color alone.
- Low-income families use KidSport and other subsidies; billing screens show subsidies plainly and without stigma.
