-- 073: several saved cards per family ("wallet")
--
-- A family can keep more than one saved card (TD Payment Profile). One is the
-- auto-pay card: it stays in customers.card_* exactly as before, so automatic
-- tuition, "Charge saved card", decline handling etc. keep working unchanged.
-- Rules (enforced in the card-wallet function): a card can be added or made
-- the auto-pay card at any time; a card can be removed only when the family
-- has 2+ cards, and never the auto-pay card itself.
--
-- customer_cards follows customers.card_profile_code automatically (trigger):
--  * set to a card already in the wallet  → that card becomes the default
--  * set to a new card (pay page "save card", enrollment, …) → added as the
--    default; those paths replace the old card in TD, so the old one is
--    marked removed
--  * cleared → that card is marked removed

create table if not exists customer_cards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  profile_code text not null unique,
  profile_mode text,
  last4 text,
  expiry text,
  card_type text,
  saved_at timestamptz,
  consent text,
  is_default boolean not null default false,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists customer_cards_customer_idx on customer_cards (customer_id);
alter table customer_cards enable row level security;
create policy "customer_cards admin read" on customer_cards for select using (is_admin());

create or replace function customers_sync_cards() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_code text := case when tg_op = 'UPDATE' then old.card_profile_code else null end;
begin
  if new.card_profile_code is not distinct from old_code then
    if new.card_profile_code is not null then
      update customer_cards set last4 = new.card_last4, expiry = new.card_expiry, card_type = new.card_type
      where profile_code = new.card_profile_code;
    end if;
    return new;
  end if;
  if new.card_profile_code is null then
    update customer_cards set is_default = false, removed_at = coalesce(removed_at, now()) where profile_code = old_code;
    return new;
  end if;
  if exists (select 1 from customer_cards where profile_code = new.card_profile_code and customer_id = new.id and removed_at is null) then
    update customer_cards set is_default = (profile_code = new.card_profile_code) where customer_id = new.id and removed_at is null;
  else
    if old_code is not null then
      update customer_cards set is_default = false, removed_at = coalesce(removed_at, now()) where profile_code = old_code;
    end if;
    update customer_cards set is_default = false where customer_id = new.id;
    insert into customer_cards (customer_id, profile_code, profile_mode, last4, expiry, card_type, saved_at, consent, is_default)
    values (new.id, new.card_profile_code, new.card_profile_mode, new.card_last4, new.card_expiry, new.card_type, coalesce(new.card_saved_at, now()), new.card_consent, true)
    on conflict (profile_code) do update set customer_id = excluded.customer_id, is_default = true, removed_at = null,
      last4 = excluded.last4, expiry = excluded.expiry, card_type = excluded.card_type;
  end if;
  return new;
end;
$$;

create trigger customers_sync_cards
after insert or update of card_profile_code, card_last4, card_expiry, card_type on customers
for each row execute function customers_sync_cards();

-- cards saved so far
insert into customer_cards (customer_id, profile_code, profile_mode, last4, expiry, card_type, saved_at, consent, is_default)
select id, card_profile_code, card_profile_mode, card_last4, card_expiry, card_type, coalesce(card_saved_at, now()), card_consent, true
from customers where card_profile_code is not null
on conflict (profile_code) do nothing;

-- (073b) parent_portal_data() now also returns 'cards': the family's saved
-- cards (last4, expiry, type, is_default), tuition card first.
