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
// One band per belt with what that belt tests, then a clean row per student
// with boxes to write marks in.
export function printScoringSheet(rows, curByBelt, test) {
  const list = [...rows].sort(byBeltThenName);
  let n = 0;
  const cols = SCORE_COLS.length;
  const body = groupsOf(list)
    .map((g) => {
      const black = g.key === 'Black Stripe';
      const p0 = planFor(g.rows[0].e, curByBelt);
      const targets = [...new Set(g.rows.map((r) => r.e.target_belt).filter(Boolean))];
      const band = black
        ? `<div class="band"><div class="bt">${chip('Black Stripe')}<b>Black Stripes</b><span class="cnt">${g.rows.length}</span></div><div class="info"><div><label>Poomsae</label>By stripe — see each student</div><div><label>Board break</label>Each student’s own break</div></div></div>`
        : `<div class="band"><div class="bt">${chip(g.key)}<b>${esc(g.key)}</b><span class="to">→ ${esc(targets.join(', '))}</span><span class="cnt">${g.rows.length}</span></div>
          <div class="info">
            <div class="pm"><label>Poomsae</label><big>${p0.poomsae ? 'Taegeuk ' + esc(p0.poomsae) : '—'}</big></div>
            <div class="wide"><label>기본동작 · Basic movements</label>${lines(p0.basic_ko).map(esc).join(' · ')}<div class="en">${lines(p0.basic_en).map(esc).join(' · ')}</div></div>
            <div><label>발차기 · Kicking</label>${lines(p0.kicking).map(esc).join('<br>')}</div>
            <div><label>격파 · Break ${p0.spot ? `<em>Spot ${esc(p0.spot)}</em>` : ''}</label>${lines(p0.break_en).map(esc).join(' · ')}<div class="en">${lines(p0.break_ko).map(esc).join(' · ')}</div></div>
          </div></div>`;
      const trs = g.rows
        .map((r) => {
          n += 1;
          const p = planFor(r.e, curByBelt);
          return `<tr><td class="no">${n}</td><td class="nm"><b>${esc(r.s.name)}</b>${black ? `<div class="own"><span>Taegeuk ${esc(p.poomsae || '—')}</span> · ${esc(lines(p.break_en).join(' · ') || 'break —')}</div><div class="bl">${esc(r.e.current_belt)} → ${esc(r.e.target_belt || '')}</div>` : ''}</td>${SCORE_COLS.map((_, k) => `<td class="sc${k === 3 && !p.sparring ? ' na' : ''}"></td>`).join('')}<td class="note"></td></tr>`;
        })
        .join('');
      return `<tbody class="grp"><tr class="bandrow"><td colspan="${cols + 3}">${band}</td></tr>${trs}</tbody>`;
    })
    .join('');
  const head = `<colgroup><col style="width:26px"><col style="width:200px">${'<col style="width:52px">'.repeat(cols)}<col></colgroup><thead><tr class="colhead"><th>#</th><th style="text-align:left">Student</th>${SCORE_COLS.map(([ko, en]) => `<th>${ko}<small>${en}</small></th>`).join('')}<th style="text-align:left">Notes</th></tr></thead>`;
  const css = `@page{size:letter landscape;margin:9mm 10mm}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  thead{display:table-header-group}
  .colhead th{font-size:10px;font-weight:700;padding:4px 3px;text-align:center;border-bottom:1.5px solid #141414;background:#fff}
  .colhead th small{display:block;font-weight:400;font-size:7.5px;color:#777;text-transform:uppercase;letter-spacing:.03em}
  tbody.grp{break-inside:avoid;page-break-inside:avoid}
  tr.bandrow td{padding:9px 0 0;border:none;height:auto}
  .band{border:1px solid #d9d9d9;border-bottom:none;border-radius:6px 6px 0 0;background:#f7f6f2;padding:5px 8px 6px}
  .bt{display:flex;align-items:center;gap:7px;font-size:12px;margin-bottom:4px}
  .bt .to{color:#666;font-size:10.5px}
  .bt .cnt{margin-left:auto;font-size:9px;font-weight:700;background:#141414;color:#fff;border-radius:999px;padding:1px 7px}
  .info{display:grid;grid-template-columns:78px 2.3fr 1.2fr 1.4fr;gap:10px;font-size:9px;line-height:1.35}
  .info label{display:block;font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;margin-bottom:1px}
  .info label em{font-style:normal;background:#141414;color:#fff;border-radius:3px;padding:0 4px;margin-left:3px;letter-spacing:0}
  .info big{font-size:13px;font-weight:800}
  .info .en{font-size:8.5px}
  td{border-top:1px solid #e4e4e4;padding:0 4px;height:27px;vertical-align:middle}
  tbody.grp tr:not(.bandrow) td:first-child{border-left:1px solid #d9d9d9}
  tbody.grp tr:not(.bandrow) td:last-child{border-right:1px solid #d9d9d9}
  tbody.grp tr:last-child td{border-bottom:1px solid #d9d9d9}
  td.no{text-align:center;color:#999;font-size:9px}
  td.nm b{font-size:11px}
  td.nm .own{font-size:8.5px;margin-top:1px}td.nm .own span{font-weight:700}
  td.nm .bl{font-size:8px;color:#888}
  td.sc{border-left:1px solid #e4e4e4}
  td.sc::after{content:'';display:block;margin:0 auto;width:30px;height:19px;border:1px solid #bdbdbd;border-radius:4px;background:#fff}
  td.na::after{border-style:dashed;border-color:#ddd;background:repeating-linear-gradient(45deg,#f2f2f2,#f2f2f2 3px,#fff 3px,#fff 6px)}
  td.note{border-left:1px solid #e4e4e4}`;
  const legend = `<div style="display:flex;gap:16px;font-size:8.5px;color:#666;margin-top:8px"><span>Hatched box = no sparring (below Yellow belt)</span><span>Spot #1 / #2 = board-break station</span></div>`;
  return open(`Scoring sheet — ${formatDate(test.test_date)}`, css, `${header('Scoring Sheet', '채점표', test, `${list.length} students`)}<table>${head}${body}</table>${legend}`);
}

// ── Board-break spots ───────────────────────────────────────────────────────
// One card per belt testing today, grouped by spot, with the students to tick.
export function printBoardSheet(rows, curriculum, curByBelt, test) {
  const list = [...rows].sort(byBeltThenName);
  const color = curriculum.filter((c) => c.belt !== 'Black Stripe').sort((a, b) => a.sort - b.sort);
  const withKids = color.map((c) => ({ c, kids: list.filter((r) => r.e.current_belt === c.belt) })).filter((x) => x.kids.length);
  const card = ({ c, kids }) => {
    const b = BELTS.find((x) => x.value === c.belt);
    const en = lines(c.break_en), ko = lines(c.break_ko);
    return `<div class="card">
      <div class="stripe" style="background:${b ? b.bg : '#fff'};border-color:${b ? b.border : '#999'}"></div>
      <div class="ch"><b>${esc(c.belt)}</b><span class="spot s${esc((c.spot || '').replace('#', ''))}">${esc(c.spot || '—')}</span></div>
      <ol class="tech">${en.map((t, i) => `<li><b>${esc(t)}</b><span>${esc(ko[i] || '')}</span></li>`).join('')}</ol>
      ${c.material ? `<div class="mat">Material: <b>${esc(c.material)}</b></div>` : ''}
      <ul class="kids">${kids.map((r) => `<li><i></i>${esc(r.s.name)}</li>`).join('')}</ul>
    </div>`;
  };
  const spots = ['#1', '#2'].map((sp) => ({ sp, items: withKids.filter((x) => x.c.spot === sp) }));
  const other = withKids.filter((x) => !['#1', '#2'].includes(x.c.spot));
  const blacks = list.filter((r) => stripeNo(r.e.current_belt) != null);
  const btr = blacks
    .map((r) => {
      const p = planFor(r.e, curByBelt);
      return `<tr><td><i class="box"></i></td><td><b>${esc(r.s.name)}</b><div class="en">${esc(r.e.current_belt)} → ${esc(r.e.target_belt || '')}</div></td><td class="brk"><b>${br(p.break_en) || '<span style="color:#bbb">—</span>'}</b>${p.break_ko ? `<div class="en">${br(p.break_ko)}</div>` : ''}</td><td>${esc(p.material || '')}</td></tr>`;
    })
    .join('');
  const summary = spots.map(({ sp, items }) => `<div class="sum"><span class="spot s${sp.slice(1)}">${sp}</span><div><b>${items.reduce((t, x) => t + x.kids.length, 0)} students</b><div class="en">${items.map((x) => esc(x.c.belt)).join(' · ') || '—'}</div></div></div>`).join('') + (blacks.length ? `<div class="sum"><span class="spot sb">BS</span><div><b>${blacks.length} black stripes</b><div class="en">Own breaks</div></div></div>` : '');
  const css = `@page{size:letter;margin:11mm}
  .sums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
  .sum{display:flex;gap:9px;align-items:center;border:1px solid #ddd;border-radius:7px;padding:7px 9px;font-size:10.5px}
  .spot{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:24px;border-radius:5px;font-weight:800;font-size:12px;padding:0 5px}
  .s1{background:#FBEFC8;color:#6b4a00}.s2{background:#F6D3D3;color:#7a1f1f}.sb{background:#141414;color:#fff}
  h2{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin:12px 0 6px;display:flex;align-items:center;gap:7px}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .card{border:1px solid #dcdcdc;border-radius:7px;overflow:hidden;break-inside:avoid;padding:0 9px 8px}
  .card .stripe{height:7px;margin:0 -9px 7px;border-bottom:1px solid}
  .ch{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;margin-bottom:5px}
  .ch .spot{height:20px;min-width:26px;font-size:10.5px}
  .tech{margin:0 0 5px;padding-left:15px;font-size:10px}
  .tech li{margin-bottom:2px}.tech li span{display:block;color:#777;font-size:9px}
  .mat{font-size:9px;color:#555;background:#f5f4ef;border-radius:4px;padding:2px 6px;margin-bottom:5px;display:inline-block}
  .kids{list-style:none;margin:0;padding:5px 0 0;border-top:1px dashed #ddd;font-size:10px;columns:1}
  .kids li{display:flex;align-items:center;gap:6px;padding:1.5px 0}
  .kids i,.box{display:inline-block;width:10px;height:10px;border:1.2px solid #141414;border-radius:2px;flex-shrink:0}
  table{width:100%;border-collapse:collapse;font-size:10.5px}
  th{font-size:8px;text-transform:uppercase;letter-spacing:.05em;color:#777;text-align:left;padding:4px 6px;border-bottom:1.5px solid #141414}
  td{padding:6px;border-bottom:1px solid #e4e4e4;vertical-align:middle}
  td:first-child{width:22px}td.brk{font-size:11px}
  .en{font-size:9px;color:#777}`;
  const sections =
    spots.filter((x) => x.items.length).map(({ sp, items }) => `<h2><span class="spot s${sp.slice(1)}" style="height:18px;min-width:24px;font-size:10px">${sp}</span>Spot ${sp}</h2><div class="grid">${items.map(card).join('')}</div>`).join('') +
    (other.length ? `<h2>Other</h2><div class="grid">${other.map(card).join('')}</div>` : '') +
    (blacks.length ? `<h2><span class="spot sb" style="height:18px;min-width:24px;font-size:9px">BS</span>Black stripes — own break</h2><table><thead><tr><th></th><th>Student</th><th>Break</th><th>Material</th></tr></thead><tbody>${btr}</tbody></table>` : '');
  return open(`Board break — ${formatDate(test.test_date)}`, css, `${header('Board Break', '격파', test, `${list.length} students`)}<div class="sums">${summary}</div>${sections}`);
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
  const [, bg, fg] = ROLE_COLORS.find(([re]) => re.test(t)) || [null, '#F1EFE7', '#3d3f39'];
  const [main, ...rest] = t.split(/\s*\(/);
  return `<span class="pill" style="background:${bg};color:${fg}">${esc(main)}</span>${rest.length ? `<div class="sub">(${esc(rest.join('('))}</div>` : ''}`;
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
  tr:nth-child(even) td{background:#faf9f6}
  td.n{text-align:left;font-weight:700;font-size:13px;padding-left:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pill{max-width:100%}
  .av{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#141414;color:#fff;font-size:11px;margin-right:9px;vertical-align:middle}
  .pill{display:inline-block;border-radius:999px;padding:4px 11px;font-size:11.5px;font-weight:600}
  .sub{font-size:9.5px;color:#777;margin-top:3px}
  .none{color:#ccc}
  .notes{margin-top:16px;border:1px solid #e6d3a8;background:#FDF8EC;border-radius:8px;padding:11px 14px;font-size:11px;line-height:1.65}
  .notes h3{margin:0 0 4px;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#854F0B}
  .notes p{margin:0}
  .big{margin-top:12px;background:#bf1c21;color:#fff;text-align:center;font-weight:800;font-size:18px;letter-spacing:.04em;padding:11px;border-radius:8px}`;
  return open(
    `Leaders Club roles — ${formatDate(test.test_date)}`,
    css,
    `${header('Leaders Club Roles', '', test, `${rows.length} assistants`)}<table><colgroup><col style="width:22%"><col style="width:26%"><col style="width:26%"><col style="width:26%"></colgroup><thead><tr><th>Assistant</th><th>Poomsae</th><th>Sparring</th><th>Board Break</th></tr></thead><tbody>${body}</tbody></table>${rest.length ? `<div class="notes"><h3>Reminders</h3>${rest.map((l) => `<p>${esc(l.replace(/^\*\s*/, ''))}</p>`).join('')}</div>` : ''}${big.map((l) => `<div class="big">${esc(l)}</div>`).join('')}`
  );
}
