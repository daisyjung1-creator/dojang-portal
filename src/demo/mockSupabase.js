// In-browser stand-in for the Supabase client, used only by the /demo copy of
// the portal. Everything lives in memory (fake data from ./seed.js) — nothing
// is read from or written to the real database, no email is sent and no card
// is charged. A refresh starts the demo over.
import { buildSeed, uuid } from './seed';

// Built on first use, so the real portal never runs any of this.
let db = null;
const now = () => new Date().toISOString();
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (list, f) => list.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

// ── Views (same maths as the SQL views) ────────────────────────────────────
function invoiceSummary() {
  return db.invoices.map((i) => {
    const paid = sum(db.invoice_payments.filter((p) => p.invoice_id === i.id), (p) => Number(p.amount) - Number(p.credit_amount || 0));
    const used = sum(db.credit_applications.filter((a) => a.invoice_id === i.id), (a) => a.amount);
    const refunded = sum(db.invoice_refunds.filter((x) => x.invoice_id === i.id), (x) => x.amount);
    const applied = paid + used;
    const total = Number(i.total) || 0;
    const status = i.voided ? 'Void' : refunded > 0 && refunded >= total - 0.005 ? 'Refunded' : refunded > 0 ? 'Partially Refunded' : applied >= total ? 'Paid' : applied > 0 ? 'Partially Paid' : 'Not Paid';
    return {
      id: i.id, invoice_number: i.invoice_number, customer_id: i.customer_id, customer_name: i.customer_name, customer_email: i.customer_email, customer_address: i.customer_address,
      invoice_date: i.invoice_date, due_date: i.due_date, subtotal: i.subtotal, gst_rate: i.gst_rate, gst_amount: i.gst_amount, total: i.total, notes: i.notes, voided: !!i.voided,
      is_opening_balance: !!i.is_opening_balance, emailed_at: i.emailed_at, created_at: i.created_at, updated_at: i.updated_at,
      amount_paid: r2(applied), balance: r2(Math.max(total - applied, 0)), amount_refunded: r2(refunded), status, reminded_at: i.reminded_at, credit_used: r2(used),
    };
  });
}
const month = (d) => String(d || '').slice(0, 7);
function groupBy(list, key) {
  const m = new Map();
  list.forEach((x) => {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  });
  return m;
}
const VIEWS = {
  invoice_summary: invoiceSummary,
  customer_balances: () =>
    [...groupBy(invoiceSummary().filter((i) => !i.voided && i.customer_id), (i) => i.customer_id)].map(([customer_id, l]) => ({
      customer_id,
      invoice_count: l.length,
      total_invoiced: r2(sum(l, (i) => i.total)),
      balance: r2(sum(l, (i) => i.balance)),
      last_invoice_date: l.map((i) => i.invoice_date).sort().pop(),
      last_invoice_number: Math.max(...l.map((i) => i.invoice_number || 0)),
      oldest_due_date: l.filter((i) => i.balance > 0).map((i) => i.due_date || i.invoice_date).sort()[0] || null,
    })),
  customer_credit: () =>
    db.customers.map((c) => ({
      customer_id: c.id,
      credit: r2(
        sum(db.invoice_payments.filter((p) => p.customer_id === c.id), (p) => p.credit_amount) -
          sum(db.credit_applications.filter((a) => a.customer_id === c.id), (a) => a.amount) -
          sum(db.invoice_refunds.filter((x) => x.customer_id === c.id && !x.invoice_id), (x) => x.amount)
      ),
    })),
  monthly_sales: () =>
    [...groupBy(invoiceSummary().filter((i) => !i.voided && !i.is_opening_balance), (i) => month(i.invoice_date))].map(([m, l]) => ({
      month: m, invoice_count: l.length, subtotal: r2(sum(l, (i) => i.subtotal)), gst: r2(sum(l, (i) => i.gst_amount)), total: r2(sum(l, (i) => i.total)), unpaid: r2(sum(l, (i) => i.balance)),
    })),
  monthly_payments: () =>
    [...groupBy(db.invoice_payments, (p) => `${month(p.payment_date)}|${p.method}`)].map(([k, l]) => ({ month: k.split('|')[0], method: k.split('|')[1], payment_count: l.length, amount: r2(sum(l, (p) => p.amount)) })),
  monthly_refunds: () =>
    [...groupBy(db.invoice_refunds, (x) => month(x.refund_date))].map(([m, l]) => {
      const live = l.filter((x) => !db.invoices.find((i) => i.id === x.invoice_id)?.voided);
      return { month: m, refund_count: l.length, refunded: r2(sum(l, (x) => x.amount)), sales_refund: r2(sum(live, (x) => x.amount - (x.gst_amount || 0))), gst_refund: r2(sum(live, (x) => x.gst_amount)) };
    }),
  inventory_levels: () => {
    const cut = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    return db.fee_items
      .filter((f) => f.track_inventory)
      .map((f) => {
        const stockIn = sum(db.inventory_movements.filter((m) => m.fee_item_id === f.id), (m) => m.quantity);
        const lines = f.inventory_since
          ? db.invoice_lines.filter((l) => {
              const i = db.invoices.find((x) => x.id === l.invoice_id);
              return l.fee_item_id === f.id && i && !i.voided && i.created_at >= f.inventory_since;
            })
          : [];
        const inv = (l) => db.invoices.find((x) => x.id === l.invoice_id);
        const sold = sum(lines, (l) => l.quantity);
        return {
          fee_item_id: f.id, name: f.name, description: f.description, default_amount: f.default_amount, low_stock_at: f.low_stock_at, inventory_since: f.inventory_since, active: f.active,
          stock_in: stockIn, sold, sold_30d: sum(lines.filter((l) => inv(l).invoice_date >= cut), (l) => l.quantity),
          on_hand: f.inventory_since ? stockIn - sold : null, last_sold: lines.map((l) => inv(l).invoice_date).sort().pop() || null,
        };
      });
  },
};

// ── Column defaults and triggers ───────────────────────────────────────────
const FALSE_COLS = ['voided', 'is_opening_balance', 'sent', 'medal', 'auto', 'is_makeup', 'done', 'form_received', 'confirmation_sent', 'subsidy', 'family_discount', 'billing_exempt', 'conditional', 'card_legacy_rb_pending', 'separate_invoices', 'renewal_cancelled', 'reregistration_fee_due'];
const TRUE_COLS = { customers: ['active'], fee_items: ['active', 'taxable'], class_schedule: ['active'], payroll_employees: ['active'] };
function withDefaults(table, row) {
  const out = { id: uuid(), created_at: now(), ...row };
  FALSE_COLS.forEach((c) => {
    if (out[c] === undefined && (db[table]?.[0] && c in db[table][0])) out[c] = false;
  });
  (TRUE_COLS[table] || []).forEach((c) => out[c] === undefined && (out[c] = true));
  if (table === 'students' && !out.status) out.status = 'active';
  if (table === 'invoice_payments' && out.credit_amount === undefined) out.credit_amount = 0;
  if (table === 'other_income' && !out.received_on) out.received_on = todayISO();
  return out;
}
const settings = () => db.invoice_settings[0];
function applied(invoiceId, skipPaymentId) {
  return (
    sum(db.invoice_payments.filter((p) => p.invoice_id === invoiceId && p.id !== skipPaymentId), (p) => Number(p.amount) - Number(p.credit_amount || 0)) +
    sum(db.credit_applications.filter((a) => a.invoice_id === invoiceId), (a) => a.amount)
  );
}
function beforeWrite(table, row, old) {
  if (table === 'invoices') {
    if (!old && !row.is_opening_balance) {
      const s = settings();
      if (row.invoice_number == null) row.invoice_number = s.next_invoice_number++;
      else if (row.invoice_number >= s.next_invoice_number) s.next_invoice_number = row.invoice_number + 1;
    }
    if (!old && !row.pay_token) row.pay_token = uuid();
    if (old) row.updated_at = now();
  }
  if (table === 'invoice_payments') {
    if (!old) {
      const s = settings();
      if (row.receipt_number == null) row.receipt_number = s.next_receipt_number++;
    }
    if (!row.invoice_id) row.credit_amount = row.customer_id ? Math.max(Number(row.amount) || 0, 0) : 0;
    else {
      const inv = db.invoices.find((i) => i.id === row.invoice_id);
      const owed = Math.max((Number(inv?.total) || 0) - applied(row.invoice_id, row.id), 0);
      row.credit_amount = r2(Math.max((Number(row.amount) || 0) - owed, 0));
    }
  }
  if (table === 'email_queue') row.sent = true; // pretend it went out
  if (table === 'students') {
    if (!row.customer_id && (row.status || 'active') !== 'withdrawn' && !(old && old.customer_id)) {
      const e = String(row.guardian_email || '').toLowerCase().split(/[,;\s]+/)[0];
      let c = e && db.customers.find((x) => String(x.email || '').toLowerCase().split(/[,;\s]+/).includes(e));
      if (!c) {
        c = withDefaults('customers', { name: row.name, contact_name: row.guardian_name, email: row.guardian_email, phone: row.guardian_phone, address: row.address, payment_type: 'manual' });
        db.customers.push(c);
      }
      row.customer_id = c.id;
    }
  }
  return row;
}

// ── Query builder ──────────────────────────────────────────────────────────
const cmp = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' || typeof b === 'number') {
    const x = Number(a), y = Number(b);
    if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};
const likeRe = (pat, flags) => new RegExp('^' + String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', flags);
const parseVal = (v) => (v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v);
function test(val, op, arg) {
  switch (op) {
    case 'eq': return val != null && String(val) === String(arg);
    case 'neq': return val == null ? false : String(val) !== String(arg);
    case 'gt': return val != null && cmp(val, arg) > 0;
    case 'gte': return val != null && cmp(val, arg) >= 0;
    case 'lt': return val != null && cmp(val, arg) < 0;
    case 'lte': return val != null && cmp(val, arg) <= 0;
    case 'like': return val != null && likeRe(arg).test(String(val));
    case 'ilike': return val != null && likeRe(arg, 'i').test(String(val));
    case 'is': return arg === null ? val == null : val === arg;
    case 'in': {
      const list = Array.isArray(arg) ? arg : String(arg).replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
      return val != null && list.map(String).includes(String(val));
    }
    case 'cs': return Array.isArray(val) && [].concat(arg).every((a) => val.includes(a));
    default: return true;
  }
}
const getPath = (row, col) => col.split('.').reduce((o, k) => (o == null ? undefined : o[k]), row);
function splitTop(s) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function orTest(row, expr) {
  return splitTop(expr).some((part) => {
    // "col.op.value" or "col.not.op.value" (the value may contain dots).
    const t = part.split('.');
    const col = t[0];
    let i = 1;
    const neg = t[i] === 'not';
    if (neg) i++;
    const op = t[i];
    const raw = t.slice(i + 1).join('.');
    const v = getPath(row, col);
    const r = test(v, op, op === 'in' ? raw : parseVal(raw));
    return neg ? (op === 'is' ? !r : v != null && !r) : r;
  });
}
// Embedded relations: "invoices(...)" / "invoices!inner(...)" → row.invoices.
function embeds(cols) {
  const out = [];
  String(cols || '').replace(/(\w+)(!inner)?\(([^)]*)\)/g, (_, rel, inner) => out.push({ rel, inner: !!inner }));
  return out;
}
const FK = { invoices: 'invoice_id', students: 'student_id', customers: 'customer_id', fee_items: 'fee_item_id', belt_tests: 'test_id' };

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.op = 'select';
    this.cols = '*';
  }
  select(cols = '*', opts = {}) {
    if (this.op === 'select') this.op = 'select';
    this.cols = cols;
    this.wantRows = true;
    this.countMode = opts.count;
    this.head = opts.head;
    return this;
  }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  upsert(rows, opts = {}) { this.op = 'upsert'; this.payload = rows; this.conflict = opts.onConflict; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  _f(col, op, arg, neg = false) { this.filters.push({ col, op, arg, neg }); return this; }
  eq(c, v) { return this._f(c, 'eq', v); }
  neq(c, v) { return this._f(c, 'neq', v); }
  gt(c, v) { return this._f(c, 'gt', v); }
  gte(c, v) { return this._f(c, 'gte', v); }
  lt(c, v) { return this._f(c, 'lt', v); }
  lte(c, v) { return this._f(c, 'lte', v); }
  like(c, v) { return this._f(c, 'like', v); }
  ilike(c, v) { return this._f(c, 'ilike', v); }
  is(c, v) { return this._f(c, 'is', v); }
  in(c, v) { return this._f(c, 'in', v); }
  contains(c, v) { return this._f(c, 'cs', v); }
  not(c, op, v) { return this._f(c, op, op === 'in' ? v : parseVal(v === null ? 'null' : v), true); }
  or(expr) { this.filters.push({ or: expr }); return this; }
  match(obj) { Object.entries(obj).forEach(([k, v]) => this.eq(k, v)); return this; }
  filter(c, op, v) { return this._f(c, op, parseVal(v)); }
  order(col, opts = {}) { this.orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n) { this.lim = n; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  abortSignal() { return this; }
  throwOnError() { return this; }

  _source() {
    if (VIEWS[this.table]) return VIEWS[this.table]();
    if (!db[this.table]) db[this.table] = [];
    return db[this.table];
  }
  _matches(row) {
    return this.filters.every((f) => {
      if (f.or) return orTest(row, f.or);
      const v = getPath(row, f.col);
      const r = test(v, f.op, f.arg);
      if (!f.neg) return r;
      // SQL: NOT (null = x) is null → row left out; "not is null" → has a value.
      return f.op === 'is' ? !r : v != null && !r;
    });
  }
  _withEmbeds(rows) {
    const list = embeds(this.cols);
    if (!list.length) return rows;
    return rows
      .map((r) => {
        const o = { ...r };
        list.forEach(({ rel }) => {
          const fk = FK[rel] || `${rel.replace(/s$/, '')}_id`;
          const src = VIEWS[rel] ? VIEWS[rel]() : db[rel] || [];
          o[rel] = src.find((x) => x.id === r[fk]) || null;
        });
        return o;
      })
      .filter((o) => list.every(({ rel, inner }) => !inner || o[rel]));
  }
  _run() {
    const t = this.table;
    let affected = [];
    if (this.op === 'insert' || this.op === 'upsert') {
      const rows = [].concat(this.payload);
      const keys = this.conflict ? this.conflict.split(',').map((s) => s.trim()) : ['id'];
      const target = this._source();
      rows.forEach((raw) => {
        const existing = this.op === 'upsert' && keys.every((k) => raw[k] !== undefined) ? target.find((x) => keys.every((k) => String(x[k]) === String(raw[k]))) : null;
        if (existing) {
          const old = { ...existing };
          Object.assign(existing, clone(raw));
          beforeWrite(t, existing, old);
          affected.push(existing);
        } else {
          const row = beforeWrite(t, withDefaults(t, clone(raw)), null);
          target.push(row);
          affected.push(row);
        }
      });
    } else if (this.op === 'update') {
      this._source().forEach((row) => {
        if (!this._matches(row)) return;
        const old = { ...row };
        Object.assign(row, clone(this.payload));
        beforeWrite(t, row, old);
        affected.push(row);
      });
    } else if (this.op === 'delete') {
      const src = this._source();
      affected = src.filter((r) => this._matches(r));
      db[t] = src.filter((r) => !affected.includes(r));
    } else {
      let rows = this._withEmbeds(this._source()).filter((r) => this._matches(r));
      const total = rows.length;
      for (const o of [...this.orders].reverse()) rows = [...rows].sort((a, b) => (o.asc ? 1 : -1) * cmp(getPath(a, o.col), getPath(b, o.col)));
      if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim != null) rows = rows.slice(0, this.lim);
      if (this.head) return { data: null, error: null, count: total };
      return this._shape(clone(rows), total);
    }
    if (!this.wantRows) return { data: null, error: null, count: null };
    return this._shape(clone(this._withEmbeds(affected)), affected.length);
  }
  _shape(rows, count) {
    const c = this.countMode ? count : null;
    if (this.one === 'single') return rows.length === 1 ? { data: rows[0], error: null, count: c } : { data: null, error: { message: rows.length ? 'Multiple rows returned' : 'No rows found', code: 'PGRST116' }, count: c };
    if (this.one === 'maybe') return { data: rows[0] || null, error: null, count: c };
    return { data: rows, error: null, count: c };
  }
  then(resolve, reject) {
    let res;
    try {
      res = this._run();
    } catch (e) {
      res = { data: null, error: { message: e.message } };
    }
    return Promise.resolve(res).then(resolve, reject);
  }
}

// ── RPCs and edge functions ────────────────────────────────────────────────
const RPC = {
  apply_customer_credit: ({ p_invoice, p_amount }) => {
    const inv = db.invoices.find((i) => i.id === p_invoice);
    if (!inv || !inv.customer_id || inv.voided) return 0;
    const avail = VIEWS.customer_credit().find((c) => c.customer_id === inv.customer_id)?.credit || 0;
    const owed = Math.max(Number(inv.total) - applied(inv.id), 0);
    const use = r2(Math.min(avail, owed, p_amount ?? owed));
    if (use <= 0.004) return 0;
    db.credit_applications.push(withDefaults('credit_applications', { customer_id: inv.customer_id, invoice_id: inv.id, amount: use, applied_date: todayISO() }));
    return use;
  },
  mark_absence_emailed: ({ p_student }) => {
    const s = db.students.find((x) => x.id === p_student);
    if (s) s.absence_emailed_at = now();
    return null;
  },
  public_class_schedule: () => clone(db.class_schedule.filter((c) => c.active)),
  public_trial_slots: () => [],
  book_trial: () => null,
};
const DEMO_OFF = 'This is the demo — card payments and online services are turned off.';
function invoke(name, { body = {} } = {}) {
  if (name === 'send-emails') return { data: { ok: true }, error: null };
  if (name === 'td-pay') {
    if (body.action === 'selftest') return { data: { ok: false, message: DEMO_OFF }, error: null };
    if (body.action === 'charge') return { data: { results: (body.invoice_ids || []).map((id) => ({ invoice_id: id, ok: false, message: DEMO_OFF })) }, error: null };
    return { data: { error: DEMO_OFF }, error: null };
  }
  return { data: { error: DEMO_OFF }, error: null };
}

// ── Auth: signed in as the demo admin ──────────────────────────────────────
const SESSION = { access_token: 'demo', user: { id: 'demo-admin', email: 'demo@example.com' } };

export function createMockClient() {
  db = buildSeed();
  return {
    from: (t) => new Query(t),
    rpc: (name, args = {}) => {
      try {
        return Promise.resolve({ data: RPC[name] ? RPC[name](args) : null, error: null });
      } catch (e) {
        return Promise.resolve({ data: null, error: { message: e.message } });
      }
    },
    functions: { invoke: (name, opts) => Promise.resolve(invoke(name, opts)) },
    auth: {
      getSession: () => Promise.resolve({ data: { session: SESSION }, error: null }),
      getUser: () => Promise.resolve({ data: { user: SESSION.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: () => Promise.resolve({ data: { session: SESSION }, error: null }),
      signOut: () => {
        window.location.href = '/demo';
        return Promise.resolve({ error: null });
      },
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  };
}
