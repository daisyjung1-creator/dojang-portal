// Days the dojang is closed every year: all Alberta general holidays, the
// optional ones (Easter Monday, Heritage Day, Truth and Reconciliation Day,
// Boxing Day), plus Christmas Eve and New Year's Eve.

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// nth weekday (0 = Sun) of a month; n = 1, 2, 3…
function nthWeekday(y, m, weekday, n) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

function easter(y) {
  // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const shift = (date, days) => new Date(date.getTime() + days * 864e5).toISOString().slice(0, 10);

export function holidaysForYear(y) {
  const e = easter(y);
  // Victoria Day: the Monday before May 25
  const may24 = new Date(Date.UTC(y, 4, 24));
  const victoria = 24 - ((may24.getUTCDay() + 6) % 7);
  return [
    { date: iso(y, 1, 1), name: "New Year's Day" },
    { date: iso(y, 2, nthWeekday(y, 2, 1, 3)), name: 'Family Day' },
    { date: shift(e, -2), name: 'Good Friday' },
    { date: shift(e, 1), name: 'Easter Monday' },
    { date: iso(y, 5, victoria), name: 'Victoria Day' },
    { date: iso(y, 7, 1), name: 'Canada Day' },
    { date: iso(y, 8, nthWeekday(y, 8, 1, 1)), name: 'Heritage Day' },
    { date: iso(y, 9, nthWeekday(y, 9, 1, 1)), name: 'Labour Day' },
    { date: iso(y, 9, 30), name: 'Truth and Reconciliation Day' },
    { date: iso(y, 10, nthWeekday(y, 10, 1, 2)), name: 'Thanksgiving' },
    { date: iso(y, 11, 11), name: 'Remembrance Day' },
    { date: iso(y, 12, 24), name: 'Christmas Eve' },
    { date: iso(y, 12, 25), name: 'Christmas Day' },
    { date: iso(y, 12, 26), name: 'Boxing Day' },
    { date: iso(y, 12, 31), name: "New Year's Eve" },
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Holidays between two ISO dates (inclusive).
export function holidaysBetween(from, to) {
  const out = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) out.push(...holidaysForYear(y));
  return out.filter((h) => h.date >= from && h.date <= to);
}
