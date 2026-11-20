-- Card step on the public /join form: a family choosing pre-authorized credit
-- card payments can save their card (TD Payment Profile, no charge) right
-- after submitting the registration. The card is kept on the registration
-- until the Dojang enrolls the family, then moves to the family (customers).
alter table registrations
  -- Made by the browser and sent with the insert, so the form can save a card
  -- for this registration only (public users can't read registrations).
  add column if not exists card_token uuid,
  add column if not exists card_profile_code text,
  add column if not exists card_profile_mode text,
  add column if not exists card_last4 text,
  add column if not exists card_expiry text,
  add column if not exists card_type text,
  add column if not exists card_saved_at timestamptz,
  add column if not exists card_consent text,
  add column if not exists card_removed_at timestamptz;
create unique index if not exists registrations_card_token on registrations (card_token);

-- The public insert may set card_token, never the saved-card fields.
drop policy if exists "registrations public insert" on registrations;
create policy "registrations public insert" on registrations for insert to anon, authenticated
  with check (
    status = 'new' and student_ids is null and handled_at is null and emailed_at is null
    and signature_name is not null and length(signature_name) between 2 and 120
    and card_profile_code is null and card_saved_at is null and card_consent is null and card_removed_at is null
  );
