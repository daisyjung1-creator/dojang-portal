# Online registration — setup (updated)

## Already done for you
- **Migration applied directly** to your live Supabase project (`rvgqfnzzpyjrawyxkkdc`).
  The `registrations` table exists now — no need to run the SQL file yourself.
- **RLS tightened to admin-only**, matching how `students` already works:
  - `anon` (public visitors): INSERT only.
  - `authenticated`: SELECT/UPDATE only if `is_admin()` — staff logins cannot
    see or approve registrations, only admins can (originally the draft
    policy allowed any logged-in user).
  - `student_id` is now a real foreign key to `public.students(id)`.
- **`AdminRegistrations.jsx` rewritten** to match your actual `students`
  columns (yours uses one `name` field and `dob`, not `first_name` /
  `last_name` / `date_of_birth`, and has no emergency-contact columns).
  Changes:
  - Builds `name` from `first_name + last_name`.
  - Maps `date_of_birth` → `dob`.
  - `guardian_name` / `guardian_phone` / `guardian_email` map straight across (already matched).
  - Adds a small **class + monthly tuition** input in the review modal —
    your registration form doesn't collect these, but `students` needs
    them, so the admin fills them in at approval time.
  - Sets `enroll_date` to the approval date (today) — this is what your
    billing-cycle day is calculated from, so it needs to be the real
    enrollment date, not the form-submission date.
  - Everything your `students` table has no column for (medical info,
    allergies, emergency contact, address, referral source, consent
    answers, signature) gets folded into the student's `notes` field so
    none of it is lost.
  - `reviewed_by` now fills in automatically from the logged-in admin's
    email.
- **`Register.jsx`** — unchanged, its fields already matched the
  `registrations` table as designed.

## What you still need to do
This portal's frontend code lives in your GitHub repo
(`daisyjung1-creator/dojang-portal`), which isn't connected to me, so I
can't push these files or edit your router myself. To finish:

1. Copy `Register.jsx` and `AdminRegistrations.jsx` into `src/pages/` in
   your repo (same as before), then re-upload via GitHub's "upload files"
   like you've been doing — Netlify will redeploy automatically.
2. Add the two routes to wherever your app's routes are defined:
   ```jsx
   <Route path="/register" element={<Register />} />
   <Route path="/admin/registrations" element={<AdminRegistrations />} /> {/* behind your existing admin auth */}
   ```
   `/register` must NOT be behind your login guard — it's the public form.
   `/admin/registrations` should sit behind the same guard your other
   admin-only tabs (Leads, Billing, etc.) use, and add a nav link for it
   in your sidebar.
3. Fill in the real policy text in `Register.jsx` step 4 (still
   placeholder `<p>...</p>` tags) — waiver, payment, makeup, withdrawal,
   governing law. Bump `POLICY_VERSION` whenever you edit it later.
4. If you'd like, share your router file (App.jsx or similar) and I can
   give you the exact patch instead of a generic snippet.

## Still TODO (unchanged from before)
- **IP capture**: left null; would need a Netlify Function reading
  request headers if you want it in the audit trail.
- **Email notifications**: `AdminRegistrations.jsx` has `// TODO`
  comments where approval/rejection emails should fire, once you connect
  an email account per your existing plan.
