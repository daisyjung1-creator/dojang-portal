// Paper sheets for the test day: judges' scoring sheet, board-break spots,
// Leaders Club roles. Opened in a new window and printed.
import { BELTS } from '../../lib/constants';
import { formatDate } from '../../lib/invoiceUtils';
import { DOJANG_NAME } from '../../lib/testScoring';
import { SCORE_COLS, planFor, byBeltThenName, stripeNo } from '../../lib/testSheets';

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const br = (x) => esc(x).replace(/\n/g, '<br>');
const chip = (belt) => {
  const b = BELTS.find((x) => x.value === belt);
  return `<i class="chip" style="background:${b ? b.bg : '#fff'};border-color:${b ? b.border : '#999'}"></i>`;
};

const BASE = `*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Helvetica,Arial,sans-serif;color:#141414;margin:0;font-size:10px;line-height:1.3}
.hd{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:7px;margin-bottom:10px;border-bottom:1.5px solid #141414}
.hd .accent{width:26px;height:3px;background:#bf1c21;margin-bottom:6px}
.hd .d{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#666}
.hd h1{font-size:21px;margin:2px 0 0;letter-spacing:-.01em}
.hd h1 span{font-weight:400;color:#888;font-size:16px;margin-left:6px}
.hd .m{font-size:9.5px;color:#555;text-align:right;line-height:1.45}
.hd .m b{font-size:12px;color:#141414}
.chip{display:inline-block;width:26px;height:8px;border:1px solid #999;border-radius:2px;vertical-align:middle}
.en{color:#6a6a6a}`;

function open(title, css, body) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE}${css}</style></head><body>${body}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}

const header = (title, ko, test, extra = '') =>
  `<div class="hd"><div><div class="accent"></div><div class="d">${esc(DOJANG_NAME)}</div><h1>${esc(title)}${ko ? `<span>${esc(ko)}</span>` : ''}</h1></div><div class="m"><b>${esc(formatDate(test.test_date))}</b><br>${esc(test.title || 'Belt Testing')}${extra ? '<br>' + extra : ''}</div></div>`;

const lines = (x) => String(x || '').split('\n').map((l) => l.trim()).filter(Boolean);
const groupsOf = (list) => {
  const groups = [];
  list.forEach((r) => {
    const key = stripeNo(r.e.current_belt) != null ? 'Black Stripe' : r.e.current_belt;
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.rows.push(r);
    else groups.push({ key, rows: [r] });
  });
  return groups;
};

// ── Judges' scoring sheet ───────────────────────────────────────────────────
// Page 1–2: one compact row per student — name, belt, poomsae, break, then a
// big empty cell per mark. Last page: what each belt tests, for reference.
const beltStyle = (belt) => {
  const b = BELTS.find((x) => x.value === belt);
  return b ? `background:${b.bg};border-color:${b.border}` : 'background:#fff';
};
const short = (x) => lines(x).join(' · ');

export function printScoringSheet(rows, curByBelt, test) {
  const list = [...rows].sort(byBeltThenName);
  const cols = SCORE_COLS.length;
  let n = 0;
  const body = groupsOf(list)
    .map((g) => {
      const label = g.key === 'Black Stripe' ? 'Black Stripes' : g.key;
      const p0 = planFor(g.rows[0].e, curByBelt);
      const targets = [...new Set(g.rows.map((r) => r.e.target_belt).filter(Boolean))].join(', ');
      const div = `<tr class="div"><td colspan="${cols + 6}"><i class="sw" style="${beltStyle(g.rows[0].e.current_belt)}"></i><b>${esc(label)}</b>${g.key !== 'Black Stripe' && targets ? `<span class="to">→ ${esc(targets)}</span>` : ''}<span class="cnt">${g.rows.length}</span>${g.key !== 'Black Stripe' && p0.kicking ? `<em>Kicking: ${esc(short(p0.kicking))}</em>` : ''}</td></tr>`;
      const trs = g.rows
        .map((r) => {
          n += 1;
          const p = planFor(r.e, curByBelt);
          return `<tr class="st"><td class="no">${n}</td><td class="nm"><b>${esc(r.s.name)}</b>${stripeNo(r.e.current_belt) != null ? `<small>${esc(r.e.current_belt.replace('Black Stripe', 'BS'))} → ${esc(String(r.e.target_belt || '').replace('Black Stripe', 'BS'))}</small>` : ''}</td><td class="pm">${p.poomsae ? (String(p.poomsae).length > 2 ? `<b class="many">${esc(p.poomsae)}</b>` : `<span>${esc(p.poomsae)}</span>`) : '—'}</td><td class="bk">${esc(short(p.break_en) || '—')}</td>${SCORE_COLS.map((_, k) => `<td class="sc${k === 3 && !p.sparring ? ' na' : ''}"></td>`).join('')}<td class="sc tot"></td><td class="ok"><i></i></td></tr>`;
        })
        .join('');
      return `<tbody>${div}${trs}</tbody>`;
    })
    .join('');
  const head = `<thead><tr><th>#</th><th class="l">Student</th><th>품새</th><th class="l">격파 Break</th>${SCORE_COLS.map(([ko, en]) => `<th class="m">${ko}<small>${en}</small></th>`).join('')}<th class="m tt">Total</th><th>Pass</th></tr></thead>`;
  // Reference page: what each belt tests.
  const belts = [...new Set(list.map((r) => (stripeNo(r.e.current_belt) != null ? null : r.e.current_belt)).filter(Boolean))];
  const ref = belts
    .map((belt) => {
      const c = curByBelt[belt] || {};
      return `<tr><td class="rb"><i class="sw" style="${beltStyle(belt)}"></i> <b>${esc(belt)}</b></td><td class="pm">${esc(c.poomsae || '—')}</td><td>${lines(c.basic_ko).map(esc).join('<br>')}</td><td class="en">${lines(c.basic_en).map(esc).join('<br>')}</td><td>${lines(c.kicking).map(esc).join('<br>')}</td><td><b>${lines(c.break_en).map(esc).join('<br>')}</b><div class="en">${lines(c.break_ko).map(esc).join(' · ')}</div></td><td class="pm">${esc(c.spot || '')}</td></tr>`;
    })
    .join('');
  const css = `@page{size:letter landscape;margin:8mm 9mm}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  thead{display:table-header-group}
  th{font-size:9.5px;font-weight:700;padding:3px 2px;border-bottom:2px solid #141414;text-align:center;vertical-align:bottom}
  th.l{text-align:left;padding-left:5px}
  th small{display:block;font-weight:400;font-size:7px;color:#777;text-transform:uppercase}
  tbody{break-inside:avoid;page-break-inside:avoid}
  tr.div td{padding:4px 6px;background:#ececec;border-top:8px solid #fff;border-bottom:1.5px solid #141414;font-size:11px;height:auto}
  tr.div b{margin:0 6px 0 6px}
  tr.div .to{font-size:9.5px;color:#555;margin-right:8px}
  tr.div .cnt{font-size:8.5px;border:1px solid #141414;border-radius:999px;padding:0 6px}
  tr.div em{font-style:normal;font-size:8.5px;color:#666;margin-left:12px}
  .sw{display:inline-block;width:22px;height:8px;border:1px solid #999;border-radius:2px;vertical-align:middle}
  tr.st td{height:25px;border-bottom:1px solid #cfcfcf;vertical-align:middle;padding:0 4px}
  tr.st:nth-child(odd) td{background:#fafafa}
  td.no{text-align:center;color:#999;font-size:9px}
  td.nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  td.nm b{font-size:12px}td.nm small{display:block;font-size:8px;color:#666;line-height:1.1}
  td.pm{text-align:center;font-weight:800;font-size:12px}
  tr.st td.pm b.many{display:block;font-size:9px;line-height:1.1;white-space:normal}
  tr.st td.pm span{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:#141414;color:#fff;font-size:11px}
  td.bk{font-size:8.5px;line-height:1.15;color:#333}
  td.sc{border-left:1px solid #cfcfcf}
  td.tot{border-left:2px solid #bf1c21;border-right:2px solid #bf1c21;background:#fff !important}
  th.tt{color:#bf1c21;border-bottom-color:#bf1c21}
  td.na{background:repeating-linear-gradient(45deg,#e9e9e9,#e9e9e9 2px,#fff 2px,#fff 6px) !important}
  td.ok{text-align:center;border-left:1px solid #cfcfcf}td.ok i{display:inline-block;width:14px;height:14px;border:1.8px solid #bf1c21;border-radius:3px}
  .ref{page-break-before:always}
  .ref h2{font-size:13px;margin:0 0 6px}
  .ref table{font-size:9.5px}
  .ref th{text-align:left;padding-left:5px}
  .ref td{border-bottom:1px solid #d6d6d6;padding:5px;vertical-align:top;line-height:1.35}
  .ref td.rb{white-space:nowrap}
  .ref .en{color:#666}`;
  const colg = `<colgroup><col style="width:22px"><col style="width:190px"><col style="width:50px"><col style="width:130px">${'<col>'.repeat(cols)}<col style="width:44px"><col style="width:34px"></colgroup>`;
  const refHtml = ref
    ? `<div class="ref">${header('Test Content', '심사 내용', test)}<table><colgroup><col style="width:110px"><col style="width:40px"><col><col><col style="width:150px"><col style="width:170px"><col style="width:36px"></colgroup><thead><tr><th>Belt (now)</th><th>품새</th><th>기본동작</th><th>Basic movements</th><th>발차기 Kicking</th><th>격파 Break</th><th>Spot</th></tr></thead><tbody>${ref}</tbody></table></div>`
    : '';
  return open(`Scoring sheet — ${formatDate(test.test_date)}`, css, `${header('Scoring Sheet', '채점표', test, `${list.length} students · grey = no sparring`)}<table>${colg}${head}${body}</table>${refHtml}`);
}

// ── Board-break spots ───────────────────────────────────────────────────────
// One page: a row per belt testing today, by spot, with names to tick.
export function printBoardSheet(rows, curriculum, curByBelt, test) {
  const list = [...rows].sort(byBeltThenName);
  const color = curriculum.filter((c) => c.belt !== 'Black Stripe').sort((a, b) => a.sort - b.sort);
  const withKids = color.map((c) => ({ c, kids: list.filter((r) => r.e.current_belt === c.belt) })).filter((x) => x.kids.length);
  const kidList = (kids) => `<div class="kg">${kids.map((r) => `<span class="k"><i></i>${esc(r.s.name)}</span>`).join('')}</div>`;
  const spotRows = (sp) => {
    const items = withKids.filter((x) => (sp ? x.c.spot === sp : !['#1', '#2'].includes(x.c.spot)));
    if (!items.length) return '';
    const total = items.reduce((t, x) => t + x.kids.length, 0);
    return `<tbody><tr class="sp"><td colspan="4"><span class="spot s${esc((sp || '').replace('#', ''))}">${esc(sp || '—')}</span><b>Spot ${esc(sp || '')}</b><span class="cnt">${total} students</span></td></tr>${items
      .map(({ c, kids }) => {
        const en = lines(c.break_en), ko = lines(c.break_ko);
        return `<tr><td class="belt"><i class="sw" style="${beltStyle(c.belt)}"></i><b>${esc(c.belt)}</b></td><td class="tech">${en.map((t, i) => `<div><b>${i + 1}. ${esc(t)}</b> <span>${esc(ko[i] || '')}</span></div>`).join('')}</td><td class="mat">${esc(c.material || '')}</td><td class="kids">${kidList(kids)}</td></tr>`;
      })
      .join('')}</tbody>`;
  };
  const blacks = list.filter((r) => stripeNo(r.e.current_belt) != null);
  const black = blacks.length
    ? `<tbody><tr class="sp"><td colspan="4"><span class="spot sb">BS</span><b>Black stripes — own break</b><span class="cnt">${blacks.length} students</span></td></tr>${blacks
        .map((r) => {
          const p = planFor(r.e, curByBelt);
          return `<tr><td class="belt"><span class="k"><i></i><b>${esc(r.s.name)}</b></span></td><td class="tech"><b>${esc(short(p.break_en)) || '<span style="color:#bbb">—</span>'}</b>${p.break_ko ? ` <span>${esc(short(p.break_ko))}</span>` : ''}</td><td class="mat">${esc(p.material || '')}</td><td class="kids"><span style="color:#888;font-size:9px">${esc(r.e.current_belt)} → ${esc(r.e.target_belt || '')}</span></td></tr>`;
        })
        .join('')}</tbody>`
    : '';
  const css = `@page{size:letter;margin:10mm}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5px}
  th{font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:#666;text-align:left;padding:3px 6px;border-bottom:2px solid #141414}
  tbody{break-inside:avoid}
  tr.sp td{padding:10px 4px 4px;border-bottom:1.5px solid #141414;font-size:12px}
  tr.sp b{margin-left:7px}
  .cnt{float:right;font-size:9px;color:#666;margin-top:3px}
  .spot{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:20px;border-radius:4px;font-weight:800;font-size:11px;padding:0 4px;vertical-align:middle}
  .s1{background:#141414;color:#fff}.s2{background:#bf1c21;color:#fff}.sb{background:#fff;color:#141414;border:1.5px solid #141414;font-size:9px}
  tr.sp td{background:#f2f2f2}
  td{padding:6px;border-bottom:1px solid #d9d9d9;vertical-align:top}
  td.belt{white-space:nowrap}td.belt b{margin-left:6px}
  .sw{display:inline-block;width:20px;height:8px;border:1px solid #999;border-radius:2px;vertical-align:middle}
  td.tech div{margin-bottom:2px}td.tech span{color:#777;font-size:9px}
  td.mat{font-size:9px;color:#444}
  .kg{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px}
  .k{display:flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .k i{display:inline-block;width:10px;height:10px;border:1.3px solid #141414;border-radius:2px;flex-shrink:0}`;
  return open(
    `Board break — ${formatDate(test.test_date)}`,
    css,
    `${header('Board Break', '격파', test, `${list.length} students`)}<table><colgroup><col style="width:165px"><col style="width:200px"><col style="width:70px"><col></colgroup><thead><tr><th>Belt</th><th>Technique</th><th>Material</th><th>Students ✓</th></tr></thead>${spotRows('#1')}${spotRows('#2')}${spotRows(null)}${black}</table>`
  );
}

// ── Leaders Club roles ──────────────────────────────────────────────────────
const ROLE_COLORS = [
  [/referee|judge/i, '#E6F0F6', '#1E4566'],
  [/camera/i, '#EEEAF6', '#4B3A86'],
  [/escort/i, '#E8F1E9', '#2A5A30'],
  [/gear/i, '#FBEAEA', '#9A2B2B'],
  [/kick pad|pad/i, '#FAEEDA', '#854F0B'],
  [/group|guard|helper/i, '#F1EFE7', '#3d3f39'],
];
const rolePill = (x) => {
  const t = String(x || '').trim();
  if (!t) return '<span class="none">—</span>';
  const [main, ...rest] = t.split(/\s*\(/);
  return `<span class="pill">${esc(main)}</span>${rest.length ? `<div class="sub">(${esc(rest.join('('))}</div>` : ''}`;
};

export function printLeaders(leaders, test) {
  const rows = (leaders?.rows || []).filter((r) => r.name);
  const notes = lines(leaders?.notes || '');
  const big = notes.filter((l) => /no groin guard/i.test(l));
  const rest = notes.filter((l) => !/no groin guard/i.test(l));
  const body = rows
    .map((r) => `<tr><td class="n"><span class="av">${esc(r.name.trim()[0] || '?')}</span>${esc(r.name)}</td><td>${rolePill(r.poomsae)}</td><td>${rolePill(r.sparring)}</td><td>${rolePill(r.board)}</td></tr>`)
    .join('');
  const css = `@page{size:letter;margin:13mm}
  table{width:100%;border-collapse:separate;border-spacing:0;font-size:12px;border:1px solid #d6d6d6;border-radius:8px;overflow:hidden;table-layout:fixed}
  th{background:#141414;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.07em;padding:9px 8px;text-align:center}
  th:first-child{text-align:left;padding-left:14px}
  td{padding:9px 8px;text-align:center;vertical-align:middle;border-top:1px solid #e6e6e6;height:50px}
  tr:nth-child(even) td{background:#fafafa}
  td.n{text-align:left;font-weight:700;font-size:13px;padding-left:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pill{max-width:100%}
  .av{display:none}
  .pill{font-size:12px;font-weight:600}
  .sub{font-size:9.5px;color:#777;margin-top:3px}
  .none{color:#ccc}
  .notes{margin-top:16px;border:1px solid #cfcfcf;border-radius:8px;padding:11px 14px;font-size:11px;line-height:1.65}
  .notes h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#555}
  .notes p{margin:0}
  .big{margin-top:12px;background:#bf1c21;color:#fff;text-align:center;font-weight:800;font-size:18px;letter-spacing:.04em;padding:11px;border-radius:8px}`;
  return open(
    `Leaders Club roles — ${formatDate(test.test_date)}`,
    css,
    `${header('Leaders Club Roles', '', test, `${rows.length} assistants`)}<table><colgroup><col style="width:22%"><col style="width:26%"><col style="width:26%"><col style="width:26%"></colgroup><thead><tr><th>Assistant</th><th>Poomsae</th><th>Sparring</th><th>Board Break</th></tr></thead><tbody>${body}</tbody></table>${rest.length ? `<div class="notes"><h3>Reminders</h3>${rest.map((l) => `<p>${esc(l.replace(/^\*\s*/, ''))}</p>`).join('')}</div>` : ''}${big.map((l) => `<div class="big">${esc(l)}</div>`).join('')}`
  );
}
