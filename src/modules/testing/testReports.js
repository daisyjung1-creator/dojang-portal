// Printable Promotion Test Reports (one page per student) and the sparring
// pairings sheet. Opened in a new window and printed — "Save as PDF" in the
// print dialog gives the PDF to hand out.
import { SECTIONS, MENTAL, SCORE_GUIDE, RANK_LABEL, DOJANG_NAME, DEFAULT_EXAMINER, summarize } from '../../lib/testScoring';
import { formatDate } from '../../lib/invoiceUtils';
import { BELTS } from '../../lib/constants';

const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const CSS = `
@page{size:letter;margin:11mm 12mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Helvetica,Arial,sans-serif;color:#141414;margin:0;font-size:10.5px;line-height:1.32}
.page{page-break-after:always;display:flex;flex-direction:column;min-height:255mm}
.page:last-child{page-break-after:auto}
.hd{display:flex;justify-content:space-between;align-items:flex-start}
.hd .dojang{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#555}
.hd h1{font-size:22px;margin:3px 0 0;letter-spacing:-.01em}
.hd .accent{width:26px;height:3px;background:#bf1c21;margin-bottom:7px}
.hd .meta{text-align:right;font-size:9.5px;color:#555}
.hd img{max-height:38px;max-width:110px;display:block;margin:0 0 4px auto}
.who{display:flex;align-items:flex-end;justify-content:space-between;margin:12px 0 10px;padding-bottom:10px;border-bottom:1.5px solid #141414}
.who .name{font-size:20px;font-weight:700}
.belts{display:flex;align-items:center;gap:8px;font-size:10px}
.belt{display:flex;flex-direction:column;align-items:center;gap:3px}
.belt i{display:block;width:58px;height:9px;border-radius:2px;border:1px solid #999}
.belt span{font-size:9px;color:#333;font-weight:700}
.arrow{color:#999;font-size:14px;margin-bottom:10px}
.tiles{display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin-bottom:12px}
.tile{border-radius:6px;padding:6px 4px 5px;text-align:center;border:1px solid #e3e3e3;background:#fafafa}
.tile .k{font-size:7.5px;text-transform:uppercase;letter-spacing:.05em;color:#666;font-weight:700;min-height:18px;display:flex;align-items:center;justify-content:center}
.tile .r{font-size:17px;font-weight:800;margin:2px 0 1px}
.tile .v{font-size:8.5px;color:#666}
.t-ES{background:#E8F1E9;border-color:#BFDCC3}.t-ES .r{color:#2A5A30}
.t-MS{background:#E6F0F6;border-color:#B9D3E4}.t-MS .r{color:#1E4566}
.t-NI{background:#FBEAEA;border-color:#EBC3C3}.t-NI .r{color:#9A2B2B}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.card{border:1px solid #dcdcdc;border-radius:7px;padding:8px 10px 7px;break-inside:avoid}
.card .top{display:flex;align-items:center;gap:8px;margin-bottom:5px}
.card h3{font-size:11.5px;margin:0;flex:1}
.score{font-size:11px;font-weight:700}
.score small{font-weight:400;color:#777}
.pill{font-size:9px;font-weight:800;border-radius:999px;padding:1px 7px;border:1px solid #ccc;color:#777;min-width:30px;text-align:center}
.p-ES{background:#E8F1E9;border-color:#BFDCC3;color:#2A5A30}.p-MS{background:#E6F0F6;border-color:#B9D3E4;color:#1E4566}.p-NI{background:#FBEAEA;border-color:#EBC3C3;color:#9A2B2B}
.bar{height:4px;background:#eee;border-radius:2px;margin-bottom:6px;overflow:hidden}
.bar b{display:block;height:100%;background:#141414;border-radius:2px}
.crit{display:flex;align-items:center;gap:6px;padding:3.5px 0;border-bottom:1px dotted #e2e2e2}
.crit:last-of-type{border-bottom:none}
.crit .c{flex:1;font-size:10.3px}
.pips{display:flex;gap:2.5px}
.pips i{width:9px;height:9px;border-radius:50%;border:1.2px solid #141414;display:block}
.pips i.on{background:#141414}
.crit .n{width:12px;text-align:right;font-weight:700;font-size:10px}
.cm{margin-top:5px;padding:4px 6px;background:#f6f5f1;border-radius:4px;font-size:9.3px;color:#333;white-space:pre-wrap;font-style:italic}
.span2{grid-column:1/-1}
.overall{margin-top:8px}
.overall .txt{font-size:10.5px;white-space:pre-wrap;min-height:16px}
.overall .lines i{display:block;border-bottom:1px solid #d6d6d6;height:20px}
.stamp{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;border:2px solid currentColor;border-radius:4px;padding:2px 8px;margin-left:12px;vertical-align:middle}
.st-pass{color:#2A5A30}.st-retest{color:#9A2B2B}
.mental .crit .c small{display:block;font-size:8px;color:#777;font-style:normal}
.foot{margin-top:auto;padding-top:10px}
.keys{display:grid;grid-template-columns:1.1fr 1fr;gap:10px;font-size:8.5px;color:#555;border-top:1px solid #e2e2e2;padding-top:7px}
.keys b{color:#141414}
.keys table{border-collapse:collapse;width:100%}
.keys td{padding:1.5px 4px;border-bottom:1px solid #eee}
.keys th{font-size:7.5px;text-transform:uppercase;color:#777;text-align:left;padding:1px 4px}
.sign{display:flex;justify-content:space-between;gap:30px;margin-top:16px}
.sign div{flex:1;border-top:1px solid #141414;padding-top:3px;font-size:9.5px}
.sign div:last-child{flex:0 0 150px}
`;

const pips = (v) => `<span class="pips">${[1, 2, 3].map((k) => `<i class="${v != null && v >= k ? 'on' : ''}"></i>`).join('')}</span>`;
const pill = (r) => `<span class="pill p-${esc(r || 'none').replace('/', '')}">${esc(r || '—')}</span>`;
const beltBar = (name) => {
  const b = BELTS.find((x) => x.value === name);
  return `<div class="belt"><i style="background:${b ? b.bg : '#fff'};border-color:${b ? b.border : '#999'}"></i><span>${esc(name || '')}</span></div>`;
};

function sectionCard(sec, comment, wide) {
  const filled = sec.marks.some((m) => m != null);
  return `<div class="card${wide ? ' span2' : ''}">
    <div class="top"><h3>${esc(sec.label)}</h3><span class="score">${filled ? sec.total : '–'}<small> / ${sec.max}</small></span>${pill(sec.rank)}</div>
    <div class="bar"><b style="width:${filled ? Math.round((sec.total / sec.max) * 100) : 0}%"></b></div>
    ${sec.criteria.map((c, i) => `<div class="crit"><span class="c">${esc(c)}</span>${pips(sec.marks[i])}<span class="n">${sec.marks[i] ?? ''}</span></div>`).join('')}
    ${comment ? `<div class="cm">${esc(comment)}</div>` : ''}
  </div>`;
}

function reportPage({ s, e }, test, logo) {
  const sc = e.scores || {};
  const sum = summarize(sc);
  const comments = sc.comments || {};
  const by = Object.fromEntries(sum.sections.map((x) => [x.key, x]));
  const tiles = [
    ...sum.sections.map((x) => ({ k: x.label, r: x.rank, v: x.marks.some((m) => m != null) ? `${x.total}/${x.max}` : '' })),
    ...sum.mental.map((m) => ({ k: m.label.replace('5 Taekwondo Values', 'TKD Values'), r: m.rank, v: m.value != null ? `${m.value}/3` : '' })),
  ]
    .map((t) => `<div class="tile t-${esc(t.r || 'x').replace('/', '')}"><div class="k">${esc(t.k)}</div><div class="r">${esc(t.r || '–')}</div><div class="v">${esc(t.v)}</div></div>`)
    .join('');
  const mental = `<div class="card mental">
    <div class="top"><h3>${esc(MENTAL.label)}</h3></div>
    ${sum.mental.map((m, i) => `<div class="crit"><span class="c">${esc(m.label)}${i === 2 ? `<small>${esc(MENTAL.note)}</small>` : ''}</span>${pips(m.value)}<span class="n">${m.value ?? ''}</span>${pill(m.rank)}</div>`).join('')}
    ${comments.mental ? `<div class="cm">${esc(comments.mental)}</div>` : ''}
  </div>`;
  const legend = SECTIONS.map((x) => `<tr><td><b>${esc(x.label)}</b></td><td>${esc(x.scale[0])}</td><td>${esc(x.scale[1])}</td><td>${esc(x.scale[2])}</td></tr>`).join('');
  return `<div class="page">
  <div class="hd">
    <div><div class="accent"></div><div class="dojang">${esc(DOJANG_NAME)}</div><h1>Promotion Test Report</h1></div>
    <div class="meta">${logo ? `<img src="${esc(logo)}" alt="">` : ''}${esc(test.title || 'Belt Testing')}<br>${esc(formatDate(test.test_date))}</div>
  </div>
  <div class="who"><div class="name">${esc(s.name)}${e.result === 'pass' ? '<span class="stamp st-pass">Passed</span>' : e.result === 'retest' ? '<span class="stamp st-retest">Retest</span>' : ''}</div><div class="belts">${beltBar(e.current_belt)}<span class="arrow">→</span>${beltBar(e.target_belt)}</div></div>
  <div class="tiles">${tiles}</div>
  <div class="grid">
    ${sectionCard(by.poomsae, comments.poomsae)}
    ${sectionCard(by.sparring, comments.sparring)}
    ${sectionCard(by.basic, comments.basic)}
    ${sectionCard(by.kicking, comments.kicking)}
    ${sectionCard(by.board, comments.board)}
    ${mental}
  </div>
  <div class="card overall"><div class="top"><h3>Instructor’s comments &amp; next goals</h3></div>${comments.overall ? `<div class="txt">${esc(comments.overall)}</div>` : '<div class="lines"><i></i><i></i><i></i></div>'}</div>
  <div class="foot">
    <div class="keys">
      <div>
        <div style="margin-bottom:3px"><b>Marks</b> (● per point, 0–3)</div>
        ${SCORE_GUIDE.map((g) => `<div><b>${g.n}</b> ${esc(g.title)} ${esc(g.text)}</div>`).join('')}
        <div style="margin-top:4px"><b>ES</b> ${RANK_LABEL.ES} · <b>MS</b> ${RANK_LABEL.MS} · <b>NI</b> ${RANK_LABEL.NI}</div>
      </div>
      <table><thead><tr><th>Total</th><th>NI</th><th>MS</th><th>ES</th></tr></thead><tbody>${legend}<tr><td><b>Mental (each)</b></td><td>0</td><td>1–2</td><td>3</td></tr></tbody></table>
    </div>
    <div class="sign"><div>${esc(test.examiner || DEFAULT_EXAMINER)}</div><div>Date: ${esc(formatDate(test.test_date))}</div></div>
  </div>
</div>`;
}

export function openReports(rows, test, logo) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Promotion Test Reports — ${esc(formatDate(test.test_date))}</title><style>${CSS}</style></head><body>${rows.map((r) => reportPage(r, test, logo)).join('')}<script>window.onload=()=>window.print()</script></body></html>`);
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
