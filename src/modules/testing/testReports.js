// Printable Promotion Test Reports (one page per student) and the sparring
// pairings sheet. Opened in a new window and printed — "Save as PDF" in the
// print dialog gives the PDF to hand out.
import { SECTIONS, MENTAL, SCORE_GUIDE, RANK_LABEL, DOJANG_NAME, DEFAULT_EXAMINER, summarize } from '../../lib/testScoring';
import { formatDate } from '../../lib/invoiceUtils';

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const rankCell = (r) => `<span class="rk rk-${esc(r || 'none').replace('/', '')}">${esc(r || '')}</span>`;

const CSS = `
@page{size:letter;margin:12mm}
*{box-sizing:border-box}
body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:0;font-size:10.5px}
.page{page-break-after:always;padding:2px}
.page:last-child{page-break-after:auto}
.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px}
.top h1{font-size:17px;margin:0}
.top .sub{font-size:12px;color:#444;margin-top:2px}
.top .accent{width:22px;height:3px;background:#bf1c21;margin-bottom:6px}
.who{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin-bottom:8px}
.who div{border:1px solid #bbb;border-radius:4px;padding:5px 7px}
.who label{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.04em;color:#777;font-weight:700}
.who b{font-size:13px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #aaa;padding:3px 5px;vertical-align:top}
th{background:#f0f0f0;font-size:9px;text-transform:uppercase;letter-spacing:.03em;text-align:left}
td.sec{font-weight:700;width:78px;background:#fafafa}
td.mk{width:34px;text-align:center;font-weight:700;font-size:11.5px}
td.cm{width:38%;font-size:10px;color:#222;white-space:pre-wrap}
tr.tot td{background:#f6f6f6;font-weight:700}
.guide{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin:0 0 8px}
.guide div{border:1px solid #ccc;border-radius:4px;padding:3px 5px;font-size:8.5px;line-height:1.3}
.guide b{font-size:10px}
.lower{display:grid;grid-template-columns:1.25fr 1fr;gap:10px;margin-top:8px}
.final td{font-size:10.5px}
.final td:last-child{text-align:center;width:60px}
.rk{font-weight:700}
.rk-ES{color:#2A5A30}.rk-MS{color:#1E4566}.rk-NI{color:#9A2B2B}.rk-NA{color:#888}
.legend td{text-align:center;font-size:9.5px}
.legend td:first-child{text-align:left;font-weight:700}
.sign{display:flex;justify-content:space-between;margin-top:14px;align-items:flex-end}
.sign .line{border-top:1px solid #111;padding-top:3px;min-width:220px;font-size:10px}
.note{font-size:8.5px;color:#555;margin-top:2px}
h2{font-size:11px;margin:0 0 4px;text-transform:uppercase;letter-spacing:.04em}
`;

function reportPage({ s, e }, test) {
  const sc = e.scores || {};
  const sum = summarize(sc);
  const comments = sc.comments || {};
  const rows = sum.sections
    .map((sec) => {
      const n = sec.criteria.length;
      const body = sec.criteria
        .map(
          (c, i) => `<tr>${i === 0 ? `<td class="sec" rowspan="${n + 1}">${esc(sec.label)}</td>` : ''}<td class="mk">${sec.marks[i] ?? ''}</td><td>${esc(c)}</td>${i === 0 ? `<td class="cm" rowspan="${n + 1}">${esc(comments[sec.key] || '')}</td>` : ''}</tr>`
        )
        .join('');
      return body + `<tr class="tot"><td class="mk">${sum.sections.find((x) => x.key === sec.key).marks.some((m) => m != null) ? sec.total : ''}</td><td>Total <span style="font-weight:400;color:#666">/ ${sec.max}</span> &nbsp; ${rankCell(sec.rank)}</td></tr>`;
    })
    .join('');
  const mental = sum.mental.map((m, i) => `<tr><td>${esc(m.label)}${i === 2 ? `<div class="note">${esc(MENTAL.note)}</div>` : ''}</td><td style="text-align:center">${rankCell(m.rank)}</td></tr>`).join('');
  const finals = [
    ...sum.mental.map((m) => [m.label, m.rank]),
    ...sum.sections.map((x) => [x.label, x.rank]),
  ]
    .map(([k, r]) => `<tr><td>${esc(k)}</td><td>${rankCell(r)}</td></tr>`)
    .join('');
  const legend = SECTIONS.map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.scale[0])}</td><td>${esc(x.scale[1])}</td><td>${esc(x.scale[2])}</td></tr>`).join('');
  return `<div class="page">
  <div class="top"><div><div class="accent"></div><h1>${esc(DOJANG_NAME)}</h1><div class="sub">Promotion Test Report</div></div><div class="sub">${esc(test.title || 'Belt Testing')} · ${esc(formatDate(test.test_date))}</div></div>
  <div class="who"><div><label>Name</label><b>${esc(s.name)}</b></div><div><label>Current belt</label><b>${esc(e.current_belt || '')}</b></div><div><label>Applied belt</label><b>${esc(e.target_belt || '')}</b></div></div>
  <div class="guide">${SCORE_GUIDE.map((g) => `<div><b>${g.n}</b> ${esc(g.title)} ${esc(g.text)}</div>`).join('')}</div>
  <table><thead><tr><th>Physical aspect</th><th style="text-align:center">Mark</th><th>Detailed criteria</th><th>Comments</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="lower">
    <div>
      <h2>Mental aspect</h2>
      <table><thead><tr><th>Element</th><th style="text-align:center;width:60px">Rank</th></tr></thead><tbody>${mental}</tbody></table>
      ${comments.mental ? `<div style="border:1px solid #aaa;border-top:none;padding:4px 6px;font-size:10px;white-space:pre-wrap">${esc(comments.mental)}</div>` : ''}
      <h2 style="margin-top:8px">Rank guide (NI · MS · ES)</h2>
      <table class="legend"><thead><tr><th>Element</th><th>NI (Need Improvement)</th><th>MS (Meets Standard)</th><th>ES (Exceeds Standard)</th></tr></thead><tbody>${legend}</tbody></table>
    </div>
    <div>
      <h2>Final score</h2>
      <table class="final"><tbody>${finals}</tbody></table>
      <div class="note" style="margin-top:4px">ES = ${RANK_LABEL.ES} · MS = ${RANK_LABEL.MS} · NI = ${RANK_LABEL.NI}</div>
    </div>
  </div>
  <div class="sign"><div class="line">${esc(test.examiner || DEFAULT_EXAMINER)}</div><div class="line" style="min-width:140px">Date: ${esc(formatDate(test.test_date))}</div></div>
</div>`;
}

export function openReports(rows, test) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Promotion Test Reports — ${esc(formatDate(test.test_date))}</title><style>${CSS}</style></head><body>${rows.map((r) => reportPage(r, test)).join('')}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}

export function openBracket(pairs, sById, test) {
  const w = window.open('', '_blank');
  if (!w) return false;
  const row = (p, i) => {
    const r = sById[p.red] || {}, b = sById[p.blue] || {};
    return `<tr><td style="text-align:center;font-weight:700">${i + 1}</td><td class="red"><b>${esc(r.name || '')}</b><div class="sm">${esc(r.belt || '')}</div></td><td class="vs">vs</td><td class="blue"><b>${esc(b.name || '')}</b><div class="sm">${esc(b.belt || '')}</div></td><td></td><td></td></tr>`;
  };
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Sparring — ${esc(formatDate(test.test_date))}</title>
<style>@page{size:letter;margin:12mm}body{font-family:Helvetica,Arial,sans-serif;color:#111;margin:0}h1{font-size:18px;margin:0}p{margin:3px 0 12px;color:#555;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #999;padding:7px 8px;vertical-align:middle}th{background:#eee;text-align:left;font-size:11px;text-transform:uppercase}
td.red{border-left:5px solid #bf1c21}td.blue{border-left:5px solid #1E4566}td.vs{text-align:center;color:#888;width:30px}.sm{font-size:11px;color:#555}tr{page-break-inside:avoid}</style></head>
<body><h1>Sparring — ${esc(test.title || 'Belt Testing')}</h1><p>${esc(formatDate(test.test_date))} · ${pairs.length} matches · Red (Hong) vs Blue (Chung)</p>
<table><thead><tr><th style="width:36px">#</th><th>Red (Hong)</th><th></th><th>Blue (Chung)</th><th style="width:90px">Score</th><th style="width:90px">Notes</th></tr></thead><tbody>${pairs.map(row).join('')}</tbody></table>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}
