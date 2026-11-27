// Event pricing: per student (plus per guest), or per family — one price for
// up to N people (students and guests together), then a set amount for each
// extra person. Mirrors the event_register() database function.

export const isFamilyPriced = (e) => e?.pricing === 'per_family';

const m = (n) => `$${Number(n || 0).toFixed(Number(n) % 1 ? 2 : 0)}`;

// Short label, e.g. "$50 per family (up to 4) · $10 each extra" or "$30 per student".
export function eventPriceLabel(e, { gst = true } = {}) {
  const tax = gst && e?.taxable ? ' + GST' : '';
  if (isFamilyPriced(e)) {
    if (!(Number(e.family_price) > 0) && !(Number(e.extra_price) > 0)) return 'Free';
    return `${m(e.family_price)} per family (up to ${e.family_includes || 4})${Number(e.extra_price) > 0 ? ` · ${m(e.extra_price)} each extra person` : ''}${tax}`;
  }
  if (!(Number(e?.price) > 0)) return 'Free';
  return `${m(e.price)} per student${tax}`;
}

// What signing up `addPeople` more costs (before GST) when the family already
// has `prevPeople` signed up. `kids`/`guests` are only used for per-student pricing.
export function eventCharge(e, { prevPeople = 0, kids = 0, guests = 0 } = {}) {
  if (isFamilyPriced(e)) {
    const inc = Number(e.family_includes) || 4;
    const add = kids + guests;
    if (!add) return 0;
    const before = Math.max(prevPeople - inc, 0);
    const after = Math.max(prevPeople + add - inc, 0);
    return (prevPeople === 0 ? Number(e.family_price) || 0 : 0) + (Number(e.extra_price) || 0) * (after - before);
  }
  return (Number(e?.price) || 0) * kids + (e?.allow_guests ? (Number(e?.guest_price) || 0) * guests : 0);
}
