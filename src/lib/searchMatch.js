// Search helpers shared by list pages.
//
// Typing with the Korean keyboard still on: "ㅁㅇ묘" is what "adam" looks like
// when typed on a 2-set (Dubeolsik) Korean layout. koToQwerty turns it back
// into the English keys that were pressed.

const CHO = ['r', 'R', 's', 'e', 'E', 'f', 'a', 'q', 'Q', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g'];
const JUNG = ['k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];
const JONG = ['', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];
// Compatibility jamo ㄱ(U+3131) … ㅣ(U+3163), typed on their own.
const JAMO = ['r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'E', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'Q', 'qt', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g',
  'k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];

export const hasHangul = (s) => /[ㄱ-ㅣ가-힣]/.test(String(s || ''));

export function koToQwerty(text) {
  let out = '';
  for (const ch of String(text || '')) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) {
      const i = c - 0xac00;
      out += CHO[Math.floor(i / 588)] + JUNG[Math.floor((i % 588) / 28)] + JONG[i % 28];
    } else if (c >= 0x3131 && c <= 0x3163) {
      out += JAMO[c - 0x3131];
    } else out += ch;
  }
  return out;
}

const digits = (s) => String(s || '').replace(/\D/g, '');

// The words to look for: what was typed, plus the English-key version when
// it was typed in Korean.
export function searchTerms(query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return hasHangul(q) ? [q, koToQwerty(q).toLowerCase()] : [q];
}

// True if any text field contains the query (or its English-key version), or
// any phone field contains the typed digits (3+ digits, any formatting).
export function matchesSearch(query, texts = [], phones = []) {
  const terms = searchTerms(query);
  if (!terms.length) return true;
  const hay = texts.filter(Boolean).map((t) => String(t).toLowerCase());
  if (terms.some((t) => hay.some((h) => h.includes(t)))) return true;
  const d = digits(query);
  return d.length >= 3 && phones.some((p) => digits(p).includes(d));
}
