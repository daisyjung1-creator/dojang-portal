-- Sign-up email: payment is by entering the card (no saved-card option).
do $$
declare def text;
begin
  def := pg_get_functiondef('public.event_register(uuid,uuid[],text,text[],text)'::regprocedure);
  def := replace(def, 'Pay online (saved card or another card): https', 'Pay online by credit card: https');
  execute def;
end $$;
