import React from 'react';

// Belt rank drawn as a plain belt band (see DESIGN.md → Belt strip).
// Not used on any screen yet; screens switch to it in a later step.
const COLORS = {
  White: { fill: '#FFFFFF', edge: '#C9C6BB' },
  Yellow: { fill: '#E8B923', edge: '#B5900E' },
  Green: { fill: '#3C7A43', edge: '#2A5A30' },
  Blue: { fill: '#2B5C8A', edge: '#1E4566' },
  Red: { fill: '#9A2B2B', edge: '#711F1F' },
  Black: { fill: '#1A1A1A', edge: '#000000' },
};
const GOLD = '#D4AF37';
// Black stripe 1–4: a coloured sticker is wrapped round the belt for each
// level (no new belt): 1 yellow, 2 + green, 3 + blue, 4 + red.
export const STICKERS = ['Yellow', 'Green', 'Blue', 'Red'];

// rank → [base colour, stripe colour, black-stripe number, dan]
const RANKS = {
  White: ['White'],
  'Yellow Stripe': ['White', 'Yellow'],
  Yellow: ['Yellow'],
  'Green Stripe': ['Yellow', 'Green'],
  Green: ['Green'],
  'Blue Stripe': ['Green', 'Blue'],
  Blue: ['Blue'],
  'Red Stripe': ['Blue', 'Red'],
  Red: ['Red'],
  'Black Stripe': ['Red', 'Black', 0],
  'Black Stripe 1': ['Red', 'Black', 1],
  'Black Stripe 2': ['Red', 'Black', 2],
  'Black Stripe 3': ['Red', 'Black', 3],
  'Black Stripe 4': ['Red', 'Black', 4],
  'Black Belt 1st Dan': ['Black', null, 0, 1],
  'Black Belt 2nd Dan': ['Black', null, 0, 2],
  'Black Belt 3rd Dan': ['Black', null, 0, 3],
};

// Colours for a rank: band, lengthwise stripe, edge, black-stripe marks and dan.
export function beltPaint(belt) {
  const [baseName, stripeName, marks = 0, dan = 0] = RANKS[belt] || RANKS.White;
  const base = COLORS[baseName];
  return { fill: base.fill, stripe: stripeName ? COLORS[stripeName].fill : null, edge: dan ? GOLD : base.edge, marks, dan, stickers: STICKERS.slice(0, marks).map((c) => COLORS[c].fill) };
}

export default function BeltStrip({ belt, width = 52, style }) {
  const [baseName, stripeName, marks = 0, dan = 0] = RANKS[belt] || RANKS.White;
  const base = COLORS[baseName];
  const stripe = stripeName ? COLORS[stripeName].fill : null;
  const edge = dan ? GOLD : base.edge;
  return (
    <svg width={width} height={(width * 14) / 72} viewBox="0 0 72 14" role="img" aria-label={`${belt || 'White'} belt`} style={{ display: 'block', flexShrink: 0, ...style }}>
      <rect x="0.75" y="0.75" width="70.5" height="12.5" rx="2.5" fill={base.fill} stroke={edge} strokeWidth="1.5" />
      {stripe && <rect x="1.5" y="5" width="69" height="4" fill={stripe} />}
      {STICKERS.slice(0, marks).map((c, i) => <rect key={`s${i}`} x={62 - i * 5} y="0.75" width="3.5" height="12.5" fill={COLORS[c].fill} stroke={COLORS[c].edge} strokeWidth="0.6" />)}
      {Array.from({ length: dan }, (_, i) => <rect key={`d${i}`} x={6 + i * 5} y="1.5" width="2.5" height="11" fill={GOLD} />)}
    </svg>
  );
}
