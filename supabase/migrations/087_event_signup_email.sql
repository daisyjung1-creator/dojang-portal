-- Parents get a confirmation email when they sign up for an event (with the
-- invoice number, amount and a pay link); the dojang gets a hidden copy (BCC).
-- Sent through the 'welcome' email type (plain message), labelled
-- 'Event sign-up' in the email log via payload.kind.

create or replace function public.event_register(p_event uuid, p_students uuid[], p_note text default null::text, p_guests text[] default null::text[], p_answer text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e events;
  today date := (now() at time zone 'America/Edmonton')::date;
  is_adm boolean := is_admin();
  fam uuid;
  fams uuid[];
  c customers;
  new_ids uuid[];
  guests text[];
  taken int;
  rate numeric;
  sub numeric := 0;
  tax_base numeric := 0;
  gst numeric;
  inv_id uuid;
  inv_no int;
  tok uuid;
  sid uuid;
  sname text;
  g text;
  pos int := 0;
  ans text := nullif(btrim(coalesce(p_answer, '')), '');
  is_fam boolean;
  prev_people int := 0;
  new_people int := 0;
  extra_before int;
  extra_after int;
  charge numeric := 0;
  st invoice_settings;
  msg text;
  kid_names text;
begin
  select * into e from events where id = p_event;
  if not found or e.archived then raise exception 'This event is not available.'; end if;
  is_fam := e.pricing = 'per_family';
  p_students := coalesce(p_students, '{}'::uuid[]);
  select coalesce(array_agg(left(btrim(x), 80)), '{}'::text[]) into guests from unnest(coalesce(p_guests, '{}'::text[])) x where btrim(x) <> '';
  if cardinality(guests) > 0 and not e.allow_guests then raise exception 'Guests are not open for this event.'; end if;
  if cardinality(guests) > 10 then raise exception 'Up to 10 guests at a time, please.'; end if;
  if e.question is not null and e.question_required and ans is null and cardinality(p_students) > 0 then
    raise exception 'Please answer: %', e.question;
  end if;

  if is_adm then
    if cardinality(p_students) = 0 then raise exception 'Choose at least one student.'; end if;
    select array_agg(distinct s.customer_id) into fams from students s where s.id = any (p_students);
    if fams is null or cardinality(fams) <> 1 or fams[1] is null then raise exception 'All students must belong to one family account.'; end if;
    fam := fams[1];
  else
    fam := my_customer_id();
    if fam is null then raise exception 'Not allowed.'; end if;
    if not e.published then raise exception 'This event is not available.'; end if;
    if e.signup_deadline is not null and e.signup_deadline < today then raise exception 'Sign-up for this event has closed.'; end if;
    if coalesce(e.end_date, e.start_date) is not null and coalesce(e.end_date, e.start_date) < today then raise exception 'This event is over.'; end if;
    if exists (select 1 from unnest(p_students) x where x not in (select my_student_ids())) then raise exception 'Not allowed.'; end if;
  end if;
  select * into c from customers where id = fam;

  select coalesce(array_agg(x), '{}'::uuid[]) into new_ids from unnest(p_students) x
  where not exists (select 1 from event_signups es where es.event_id = p_event and es.student_id = x and es.status = 'signed_up');
  if cardinality(new_ids) = 0 and cardinality(guests) = 0 then raise exception 'Already signed up.'; end if;
  if cardinality(guests) > 0 and cardinality(new_ids) = 0
     and not exists (select 1 from event_signups es where es.event_id = p_event and es.customer_id = fam and es.status = 'signed_up') then
    raise exception 'Sign up at least one student to bring guests.';
  end if;

  if e.capacity is not null then
    select (select count(*) from event_signups where event_id = p_event and status = 'signed_up')
         + (select count(*) from event_guests where event_id = p_event and removed_at is null) into taken;
    if taken + cardinality(new_ids) + cardinality(guests) > e.capacity then
      raise exception 'Sorry, only % spot(s) left.', greatest(e.capacity - taken, 0);
    end if;
  end if;

  if is_fam then
    -- People already signed up for this family (students + guests), then what this adds.
    select (select count(*) from event_signups where event_id = p_event and customer_id = fam and status = 'signed_up')
         + (select count(*) from event_guests where event_id = p_event and customer_id = fam and removed_at is null)
      into prev_people;
    new_people := cardinality(new_ids) + cardinality(guests);
    extra_before := greatest(prev_people - e.family_includes, 0);
    extra_after := greatest(prev_people + new_people - e.family_includes, 0);
    charge := (case when prev_people = 0 then e.family_price else 0 end) + e.extra_price * (extra_after - extra_before);
  end if;

  if (not is_fam and ((e.price > 0 and cardinality(new_ids) > 0) or (e.guest_price > 0 and cardinality(guests) > 0)))
     or (is_fam and charge > 0) then
    select coalesce(gst_rate, 5) into rate from invoice_settings where id = 1;
    insert into invoices (customer_id, customer_name, customer_email, customer_address, invoice_date, due_date, gst_rate, notes)
    values (fam, c.name, c.email, nullif(concat_ws(E'\n', nullif(c.address, ''), nullif(c.printed_info, '')), ''), today,
            greatest(today, coalesce(e.signup_deadline, e.start_date, today)), rate,
            'Event: ' || e.title || coalesce(' (' || to_char(e.start_date, 'Mon DD, YYYY') || ')', ''))
    returning id, invoice_number, pay_token into inv_id, inv_no, tok;

    if is_fam then
      if prev_people = 0 and e.family_price > 0 then
        insert into invoice_lines (invoice_id, position, fee_item_id, item_name, description, quantity, unit_price, taxable, amount)
        values (inv_id, pos, e.fee_item_id, e.title || ' - family',
                e.title || ' - family (up to ' || e.family_includes || '): ' ||
                  array_to_string(array_cat(coalesce((select array_agg(split_part(name, ' ', 1) order by name) from students where id = any (new_ids)), '{}'::text[]), guests), ', '),
                1, e.family_price, e.taxable, e.family_price);
        pos := pos + 1;
        sub := sub + e.family_price;
        if e.taxable then tax_base := tax_base + e.family_price; end if;
      end if;
      if extra_after > extra_before and e.extra_price > 0 then
        insert into invoice_lines (invoice_id, position, fee_item_id, item_name, description, quantity, unit_price, taxable, amount)
        values (inv_id, pos, e.fee_item_id, e.title || ' - extra person',
                e.title || ' - extra person' || case when extra_after - extra_before > 1 then 's' else '' end || ' (over ' || e.family_includes || ')'
                  || case when prev_people > 0 then ': ' || array_to_string(array_cat(coalesce((select array_agg(split_part(name, ' ', 1) order by name) from students where id = any (new_ids)), '{}'::text[]), guests), ', ') else '' end,
                extra_after - extra_before, e.extra_price, e.taxable, e.extra_price * (extra_after - extra_before));
        pos := pos + 1;
        sub := sub + e.extra_price * (extra_after - extra_before);
        if e.taxable then tax_base := tax_base + e.extra_price * (extra_after - extra_before); end if;
      end if;
    else
      if e.price > 0 then
        foreach sid in array new_ids loop
          select name into sname from students where id = sid;
          insert into invoice_lines (invoice_id, position, fee_item_id, student_id, item_name, description, quantity, unit_price, taxable, amount)
          values (inv_id, pos, e.fee_item_id, sid, e.title, e.title || ' - ' || sname, 1, e.price, e.taxable, e.price);
          pos := pos + 1;
          sub := sub + e.price;
          if e.taxable then tax_base := tax_base + e.price; end if;
        end loop;
      end if;
      if e.guest_price > 0 and cardinality(guests) > 0 then
        insert into invoice_lines (invoice_id, position, fee_item_id, item_name, description, quantity, unit_price, taxable, amount)
        values (inv_id, pos, e.fee_item_id, e.title || ' - guest', e.title || ' - guest' || case when cardinality(guests) > 1 then 's' else '' end || ': ' || array_to_string(guests, ', '),
                cardinality(guests), e.guest_price, e.taxable, e.guest_price * cardinality(guests));
        sub := sub + e.guest_price * cardinality(guests);
        if e.taxable then tax_base := tax_base + e.guest_price * cardinality(guests); end if;
      end if;
    end if;
    gst := round(tax_base * rate / 100, 2);
    update invoices set subtotal = round(sub, 2), gst_amount = gst, total = round(sub, 2) + gst where id = inv_id;
  end if;

  if cardinality(new_ids) > 0 then
    insert into event_signups (event_id, student_id, customer_id, invoice_id, status, source, note, answer)
    select p_event, x, fam, inv_id, 'signed_up', case when is_adm then 'admin' else 'parent' end, nullif(btrim(coalesce(p_note, '')), ''), ans
    from unnest(new_ids) x
    on conflict (event_id, student_id) do update set status = 'signed_up', invoice_id = excluded.invoice_id, customer_id = excluded.customer_id,
      source = excluded.source, note = excluded.note, answer = excluded.answer, created_at = now();
  elsif ans is not null then
    update event_signups set answer = ans where event_id = p_event and customer_id = fam and status = 'signed_up';
  end if;
  foreach g in array guests loop
    insert into event_guests (event_id, customer_id, invoice_id, name) values (p_event, fam, inv_id, g);
  end loop;

  -- Confirmation email to the family (the dojang gets a hidden copy).
  if not is_adm and nullif(btrim(coalesce(c.email, '')), '') is not null then
    select * into st from invoice_settings where id = 1;
    select string_agg(split_part(name, ' ', 1), ', ' order by name) into kid_names from students where id = any (new_ids);
    msg := 'Hello ' || coalesce(nullif(split_part(btrim(coalesce(c.contact_name, '')), ' ', 1), ''), 'there') || ',' || E'\n\n'
      || case when inv_id is not null then 'Thank you for signing up for ' else 'You''re signed up for ' end || e.title
      || coalesce(' on ' || to_char(e.start_date, 'FMDay, FMMonth FMDD'), '')
      || coalesce(' at ' || ltrim(to_char(e.start_time, 'HH12:MI AM'), '0'), '')
      || coalesce(' (' || nullif(btrim(e.location), '') || ')', '') || '.' || E'\n\n'
      || case when kid_names is not null then 'Signed up: ' || kid_names || E'\n' else '' end
      || case when cardinality(guests) > 0 then 'Guests: ' || array_to_string(guests, ', ') || E'\n' else '' end
      || case when inv_id is not null then
           E'\n' || 'Invoice #' || inv_no || ': $' || to_char((select total from invoices where id = inv_id), 'FM999,990.00') || E'\n'
           || 'Your sign-up is complete once this invoice is paid.' || E'\n'
           || 'Pay online by credit card: https://dojang-portal.netlify.app/pay/' || tok || E'\n'
           || 'You can also pay from Billing in the parent portal.' || E'\n'
         else E'\n' || 'There is no charge for this sign-up.' || E'\n' end
      || E'\n' || 'See you there!' || E'\n\n' || 'Master Daisy' || E'\n' || coalesce(st.business_name, 'Champion Hankook Taekwondo');
    insert into email_queue (type, student_id, recipient_email, payload)
    values ('welcome', new_ids[1], c.email,
            jsonb_build_object('kind', 'event_signup', 'event_id', p_event,
                               'subject', case when inv_id is not null then 'Almost done: ' || e.title || ' — please pay Invoice #' || inv_no else 'You''re signed up: ' || e.title end,
                               'message', msg));
  end if;

  if not is_adm then
    insert into dashboard_notes (note_date, body, link_tab)
    values (null, 'Event sign-up: ' || coalesce((select string_agg(name, ', ') from students where id = any (new_ids)), '')
                  || case when cardinality(guests) > 0 then case when cardinality(new_ids) > 0 then ' + ' else '' end || cardinality(guests) || ' guest(s)' else '' end
                  || ' → ' || e.title || coalesce(' — "' || left(ans, 80) || '"', ''), 'events');
  end if;

  return jsonb_build_object('invoice_id', inv_id, 'invoice_number', inv_no, 'pay_token', tok,
                            'total', (select total from invoices where id = inv_id), 'signed_up', cardinality(new_ids), 'guests', cardinality(guests));
end;
$function$;
