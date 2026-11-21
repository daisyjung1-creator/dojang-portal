import React, { useEffect, useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { styles } from '../../lib/uiStyles';
import { formatDate } from '../../lib/invoiceUtils';
import { beltIndex } from '../../lib/beltTesting';
import { PATCHES, MEDAL_INTRO, MEDAL_MIN, goodCount } from '../../lib/testAwards';

const chip = (bg, color, border) => ({ background: bg, color, border: `1px solid ${border}`, borderRadius: 999, padding: '1px 9px', fontSize: 12, whiteSpace: 'nowrap' });
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const monthYear = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', year: 'numeric' }) : '');

// Medal and character patch for each student on the test, with what they got
// at earlier tests (a patch is given only once), plus the printouts for the
// end of the test: the new belt list and the awards list with a short
// introduction to read for each award.
export default function AwardsView({ rows, test, tests, onPatch, say }) {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const ids = rows.map((r) => r.s.id);
    if (!ids.length) return setHistory([]);
    supabase
      .from('belt_test_entries')
      .select('student_id, test_id, patch, medal')
      .in('student_id', ids)
      .neq('test_id', test.id)
      .or('patch.not.is.null,medal.eq.true')
      .then(({ data }) => setHistory(data || []));
  }, [test.id, rows.length]);

  const dateOf = useMemo(() => Object.fromEntries(tests.map((t) => [t.id, t.test_date])), [tests]);
  const pastBy = useMemo(() => {
    const m = {};
    history.forEach((h) => (m[h.student_id] ||= []).push({ ...h, date: dateOf[h.test_id] || '' }));
    Object.values(m).forEach((l) => l.sort((a, b) => (a.date < b.date ? -1 : 1)));
    return m;
  }, [history, dateOf]);

  const passed = rows.filter((r) => r.e.result === 'pass');
  const awarded = rows.filter((r) => r.e.medal || r.e.patch);
  const fail = (ok) => ok || say('Allow pop-ups to print.', true);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button className="dp-btn dp-btn-primary" disabled={!passed.length} onClick={() => fail(printNewBelts(passed, test))}><Printer size={15} /> Print new belt list ({passed.length})</button>
        <button className="dp-btn" disabled={!awarded.length} onClick={() => fail(printAwards(awarded, test))}><Printer size={15} /> Print awards list ({awarded.length})</button>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5B5F56' }}>Medal suggested at {MEDAL_MIN}+ ES · each patch can be given to a student only once</span>
      </div>

      <div style={styles.card}>
        {!rows.length ? (
          <p style={{ padding: 20, color: '#5B5F56', fontSize: 14 }}>Add students to the test first.</p>
        ) : (
          <table className="dp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Result</th>
                <th style={{ textAlign: 'center' }}>ES</th>
                <th style={{ textAlign: 'center' }}>Medal</th>
                <th>Patch</th>
                <th>Earlier awards</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ e, s }) => {
                const good = goodCount(e.scores, e.current_belt);
                const past = pastBy[s.id] || [];
                const gotPatch = Object.fromEntries(past.filter((p) => p.patch).map((p) => [p.patch, p.date]));
                const repeat = e.patch && gotPatch[e.patch];
                return (
                  <tr key={e.id} className="dp-row">
                    <td style={{ fontWeight: 500 }}>
                      {s.name}
                      <div style={{ fontSize: 11.5, color: '#8A8D84', fontWeight: 400 }}>{e.current_belt} → {e.target_belt}</div>
                    </td>
                    <td style={{ fontSize: 12.5, textTransform: 'capitalize', color: e.result === 'pass' ? '#2A5A30' : '#5B5F56' }}>{e.result}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={good >= MEDAL_MIN ? chip('#FAEEDA', '#854F0B', '#EBCB91') : chip('#F1EFE7', '#5B5F56', '#DEDACC')} title={good >= MEDAL_MIN ? 'Medal suggested' : ''}>
                        {good}{good >= MEDAL_MIN ? ' · medal' : ''}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" aria-label="Medal" checked={!!e.medal} onChange={(ev) => onPatch(e, { medal: ev.target.checked })} />
                    </td>
                    <td>
                      <select className="dp-select" style={{ fontSize: 12.5, padding: '3px 6px', borderColor: repeat ? '#9A2B2B' : undefined }} value={e.patch || ''} onChange={(ev) => onPatch(e, { patch: ev.target.value || null })}>
                        <option value="">—</option>
                        {PATCHES.map((p) => (
                          <option key={p.name} value={p.name} disabled={!!gotPatch[p.name] && e.patch !== p.name}>
                            {p.name}{gotPatch[p.name] ? ` (already got ${monthYear(gotPatch[p.name])})` : ''}
                          </option>
                        ))}
                      </select>
                      {repeat && <div style={{ fontSize: 11.5, color: '#9A2B2B', marginTop: 2 }}>Already received at the {monthYear(repeat)} test</div>}
                    </td>
                    <td style={{ fontSize: 12.5, color: '#5B5F56', whiteSpace: 'normal', minWidth: 160 }}>
                      {past.length
                        ? past.map((p, i) => (
                            <span key={i} style={{ marginRight: 8, whiteSpace: 'nowrap' }}>
                              {[p.medal && 'Medal', p.patch].filter(Boolean).join(' + ')} <span style={{ color: '#8A8D84' }}>({monthYear(p.date)})</span>
                            </span>
                          ))
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

const CSS = `body{font-family:Helvetica,Arial,sans-serif;margin:28px;color:#111}
.accent{width:26px;height:3px;background:#BE1C21;margin-bottom:8px}
h1{font-size:22px;margin:0}p.sub{margin:4px 0 18px;color:#555;font-size:13px}
h2{font-size:16px;margin:22px 0 6px;padding-bottom:4px;border-bottom:1.5px solid #111;break-after:avoid}
table{width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:8px}th,td{border-bottom:1px solid #ddd;padding:6px 6px;text-align:left}th{font-size:11px;text-transform:uppercase;color:#666;letter-spacing:.04em}
.intro{font-size:13.5px;line-height:1.5;background:#f6f5f1;border-left:3px solid #BE1C21;padding:8px 12px;margin:6px 0 8px}
.names{font-size:15px;font-weight:bold;margin:4px 0 0}
.award{break-inside:avoid;margin-bottom:14px}
.chk{width:18px}`;

function openPrint(title, body) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
  return true;
}

// Students who passed, grouped by their new belt (lowest first).
export function printNewBelts(passed, test) {
  const groups = {};
  passed.forEach((r) => (groups[r.e.target_belt] ||= []).push(r));
  const order = Object.keys(groups).sort((a, b) => beltIndex(a) - beltIndex(b));
  let n = 0;
  const body = order
    .map(
      (belt) => `<h2>${esc(belt)} <span style="font-weight:normal;color:#666;font-size:13px">· ${groups[belt].length}</span></h2>
<table style="table-layout:fixed"><thead><tr><th style="width:28px">#</th><th style="width:55%">Student</th><th>From</th><th class="chk" style="width:24px">✓</th></tr></thead><tbody>${groups[belt]
        .sort((a, b) => a.s.name.localeCompare(b.s.name))
        .map((r) => `<tr><td>${++n}</td><td><b>${esc(r.s.name)}</b></td><td>${esc(r.e.current_belt)}</td><td>☐</td></tr>`)
        .join('')}</tbody></table>`
    )
    .join('');
  return openPrint(`New belts — ${formatDate(test.test_date)}`, `<div class="accent"></div><h1>New Belt List</h1><p class="sub">${esc(test.title || 'Belt Testing')} · ${esc(formatDate(test.test_date))} · ${passed.length} students promoted</p>${body}`);
}

// Medals, then each patch with its introduction and the students receiving it.
export function printAwards(awarded, test) {
  const nameList = (list) => list.map((r) => `${esc(r.s.name)} <span style="font-weight:normal;color:#666;font-size:12.5px">(${esc(r.e.target_belt && r.e.result === 'pass' ? r.e.target_belt : r.e.current_belt)})</span>`).join('<br>');
  const medals = awarded.filter((r) => r.e.medal).sort((a, b) => a.s.name.localeCompare(b.s.name));
  let body = '';
  if (medals.length) body += `<div class="award"><h2>Medal <span style="font-weight:normal;color:#666;font-size:13px">· ${medals.length}</span></h2><div class="intro">${esc(MEDAL_INTRO)}</div><div class="names">${nameList(medals)}</div></div>`;
  PATCHES.forEach((p) => {
    const list = awarded.filter((r) => r.e.patch === p.name).sort((a, b) => a.s.name.localeCompare(b.s.name));
    if (!list.length) return;
    body += `<div class="award"><h2>${esc(p.name)} patch <span style="font-weight:normal;color:#666;font-size:13px">· ${list.length}</span></h2><div class="intro">${esc(p.intro)}</div><div class="names">${nameList(list)}</div></div>`;
  });
  // At-a-glance list for handing out
  const glance = [...awarded]
    .sort((a, b) => beltIndex(a.e.current_belt) - beltIndex(b.e.current_belt) || a.s.name.localeCompare(b.s.name))
    .map((r) => `<tr><td><b>${esc(r.s.name)}</b></td><td>${r.e.medal ? 'Medal' : ''}</td><td>${esc(r.e.patch || '')}</td><td>☐</td></tr>`)
    .join('');
  body += `<h2>Checklist</h2><table><thead><tr><th>Student</th><th>Medal</th><th>Patch</th><th class="chk">✓</th></tr></thead><tbody>${glance}</tbody></table>`;
  return openPrint(`Awards — ${formatDate(test.test_date)}`, `<div class="accent"></div><h1>Awards</h1><p class="sub">${esc(test.title || 'Belt Testing')} · ${esc(formatDate(test.test_date))} · ${medals.length} medal${medals.length === 1 ? '' : 's'}, ${awarded.filter((r) => r.e.patch).length} patches</p>${body}`);
}

