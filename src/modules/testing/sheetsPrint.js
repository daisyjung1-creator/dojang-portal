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
body{font-family:Helvetica,Arial,sans-serif;color:#141414;margin:0}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #141414;padding-bottom:5px;margin-bottom:8px}
.hd .d{font-size:8.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#666}
.hd h1{font-size:18px;margin:2px 0 0}
.hd .m{font-size:10px;color:#555;text-align:right}
.accent{width:24px;height:3px;background:#bf1c21;margin-bottom:5px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #9a9a9a;padding:3px 5px;vertical-align:top}
th{background:#ececec;font-size:9px;text-align:center}
.chip{display:inline-block;width:22px;height:7px;border:1px solid #999;border-radius:1px;vertical-align:middle;margin-right:5px}
.ko{color:#141414}.en{color:#555;font-size:.92em}`;

function open(title, css, body) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${BASE}${css}</style></head><body>${body}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}

const header = (title, test, extra = '') =>
  `<div class="hd"><div><div class="accent"></div><div class="d">${esc(DOJANG_NAME)}</div><h1>${esc(title)}</h1></div><div class="m">${esc(test.title || 'Belt Testing')}<br>${esc(formatDate(test.test_date))}${extra ? '<br>' + extra : ''}</div></div>`;

// ── Judges' scoring sheet ───────────────────────────────────────────────────
export function printScoringSheet(rows, curByBelt, test) {
  const list = [...rows].sort(byBeltThenName);
  const groups = [];
  list.forEach((r) => {
    const key = stripeNo(r.e.current_belt) != null ? 'Black Stripe' : r.e.current_belt;
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.rows.push(r);
    else groups.push({ key, rows: [r] });
  });
  let n = 0;
  const blanks = SCORE_COLS.map(() => '<td class="sc"></td>');
  const body = groups
    .map((g) => {
      const black = g.key === 'Black Stripe';
      const first = planFor(g.rows[0].e, curByBelt);
      const span = g.rows.length;
      return `<tbody class="grp">${g.rows
        .map((r, i) => {
          n += 1;
          const p = planFor(r.e, curByBelt);
          const shared = !black && i === 0;
          const cur = `<td class="cur" rowspan="${span}">`;
          return `<tr>
            <td class="no">${n}</td>
            <td class="nm"><b>${esc(r.s.name)}</b><div class="bl">${chip(r.e.current_belt)}${esc(r.e.current_belt)} → ${esc(r.e.target_belt || '')}</div></td>
            ${black ? `<td class="pm">${esc(p.poomsae)}</td>` : shared ? `<td class="pm" rowspan="${span}">${esc(first.poomsae)}</td>` : ''}
            ${black ? (i === 0 ? `${cur}</td>${cur}</td>` : '') : shared ? `${cur}<div class="ko">${br(first.basic_ko)}</div><div class="en">${br(first.basic_en)}</div></td>${cur}${br(first.kicking)}</td>` : ''}
            ${black ? `<td class="cur"><b>${br(p.break_en)}</b>${p.break_ko ? `<div class="en">${br(p.break_ko)}</div>` : ''}</td>` : shared ? `${cur}<div class="ko">${br(first.break_ko)}</div><div class="en">${br(first.break_en)}</div></td>` : ''}
            ${blanks.map((b, k) => (k === 3 && !p.sparring ? '<td class="sc na"></td>' : b)).join('')}
          </tr>`;
        })
        .join('')}</tbody>`;
    })
    .join('');
  const css = `@page{size:letter landscape;margin:9mm}
  table{font-size:9.5px;table-layout:fixed}
  td.no{text-align:center;color:#666}
  td.nm b{font-size:10.5px}
  .bl{font-size:8.3px;color:#555;margin-top:1px}
  td.pm{text-align:center;font-weight:700;font-size:13px;vertical-align:middle}
  td.cur{font-size:8.8px;line-height:1.25}
  td.sc{width:40px;height:30px}
  td.na{background:repeating-linear-gradient(45deg,#f3f3f3,#f3f3f3 4px,#fff 4px,#fff 8px)}
  tbody.grp{page-break-inside:avoid;border-top:2px solid #141414}
  thead{display:table-header-group}
  .cols{width:auto}`;
  const head = `<thead><tr><th style="width:22px">#</th><th style="width:150px">Name / Belt</th><th style="width:46px">품새<br>Poomsae</th><th style="width:150px">기본동작<br>Basic movements</th><th style="width:105px">발차기<br>Kicking</th><th style="width:112px">격파<br>Board break</th>${SCORE_COLS.map(([ko, en]) => `<th>${ko}<br><span style="font-weight:400">${en}</span></th>`).join('')}</tr></thead>`;
  return open(`Scoring sheet — ${formatDate(test.test_date)}`, css, `${header('Scoring Sheet · 채점표', test, `${list.length} students`)}<table>${head}${body}</table>`);
}

// ── Board-break spots ───────────────────────────────────────────────────────
export function printBoardSheet(rows, curriculum, curByBelt, test) {
  const list = [...rows].sort(byBeltThenName);
  const color = curriculum.filter((c) => c.belt !== 'Black Stripe').sort((a, b) => a.sort - b.sort);
  const tr = color
    .map((c) => {
      const kids = list.filter((r) => r.e.current_belt === c.belt);
      const [k1, k2] = String(c.break_en || '').split('\n');
      const [j1, j2] = String(c.break_ko || '').split('\n');
      return `<tr class="${kids.length ? '' : 'none'}"><td class="belt">${chip(c.belt)}${esc(c.belt)}</td><td class="spot s${esc((c.spot || '').replace('#', ''))}">${esc(c.spot)}</td>
        <td><b>${esc(k1 || '')}</b><div class="en">${esc(j1 || '')}</div></td><td><b>${esc(k2 || '')}</b><div class="en">${esc(j2 || '')}</div></td>
        <td class="mat">${esc(c.material || '')}</td><td class="kids">${kids.map((r) => esc(r.s.name)).join(', ') || '<span style="color:#aaa">—</span>'}</td></tr>`;
    })
    .join('');
  const blacks = list.filter((r) => stripeNo(r.e.current_belt) != null);
  const btr = blacks
    .map((r, i) => {
      const p = planFor(r.e, curByBelt);
      return `<tr>${i === 0 ? `<td class="belt" rowspan="${blacks.length}">${chip('Black Stripe')}Black Stripe</td>` : ''}<td class="kid"><b>${esc(r.s.name)}</b><div class="en">${esc(r.e.current_belt)} → ${esc(r.e.target_belt || '')}</div></td><td colspan="2"><b>${br(p.break_en)}</b>${p.break_ko ? `<div class="en">${br(p.break_ko)}</div>` : ''}</td><td class="mat">${esc(p.material || '')}</td><td></td></tr>`;
    })
    .join('');
  const css = `@page{size:letter;margin:11mm}
  table{font-size:11px}td{padding:6px 7px;vertical-align:middle}
  td.belt{width:120px;font-weight:700;white-space:nowrap}
  td.spot{width:46px;text-align:center;font-weight:800;font-size:13px}
  td.s1{background:#FDF3D7}td.s2{background:#F8D7D7}
  td.mat{width:90px;font-size:10px}td.kids{font-size:9.5px;color:#333;width:170px}
  tr.none td{color:#999}tr.none td.spot{background:#f6f6f6}
  .en{font-size:9.5px;color:#666;margin-top:1px}h2{font-size:12px;margin:14px 0 5px;text-transform:uppercase;letter-spacing:.05em}`;
  const thead = `<thead><tr><th>Belt (now)</th><th>Spot</th><th>Technique 1</th><th>Technique 2</th><th>Material</th><th>Students</th></tr></thead>`;
  return open(
    `Board break — ${formatDate(test.test_date)}`,
    css,
    `${header('Board Break · 격파', test)}<table>${thead}<tbody>${tr}</tbody></table>${blacks.length ? `<h2>Black stripes — own break</h2><table><thead><tr><th>Belt</th><th>Student</th><th colspan="2">Break</th><th>Material</th><th>Done</th></tr></thead><tbody>${btr}</tbody></table>` : ''}`
  );
}

// ── Leaders Club roles ──────────────────────────────────────────────────────
export function printLeaders(leaders, test) {
  const rows = (leaders?.rows || []).filter((r) => r.name);
  const notes = leaders?.notes || '';
  const css = `@page{size:letter;margin:14mm}
  table{font-size:13px}th{font-size:11px;padding:7px}td{padding:10px 9px;text-align:center;vertical-align:middle;height:46px}
  td.n{font-weight:700;text-align:left;width:150px}
  .notes{margin-top:22px;text-align:center;font-size:12px;line-height:1.7;white-space:pre-wrap}
  .notes b{font-size:15px}`;
  // "Group 1 (Group 3 Assist)" prints the bracket part on its own line.
  const role = (x) => br(x).replace(/\s+\(/g, '<br>(');
  const body = rows.map((r) => `<tr><td class="n">${esc(r.name)}</td><td>${role(r.poomsae)}</td><td>${role(r.sparring)}</td><td>${role(r.board)}</td></tr>`).join('');
  const noteHtml = notes
    .split('\n')
    .map((l) => (/^no groin guard/i.test(l.trim()) ? `<b>${esc(l)}</b>` : esc(l)))
    .join('\n');
  return open(
    `Leaders Club roles — ${formatDate(test.test_date)}`,
    css,
    `${header('Leaders Club · Roles', test)}<table><thead><tr><th>Assistant</th><th>Poomsae</th><th>Sparring</th><th>Board Break</th></tr></thead><tbody>${body}</tbody></table>${notes ? `<div class="notes">${noteHtml}</div>` : ''}`
  );
}
