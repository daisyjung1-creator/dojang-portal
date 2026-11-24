import React from 'react';
import { TAPES, hasTapes } from '../lib/tapes';
import { beltPaint } from './BeltStrip';

// A belt swatch with the curriculum tapes the student has earned wrapped
// around its end (in order white → green), like the real belt.
export default function BeltWithTapes({ belt, tapes, width = 40, height = 14, outline }) {
  // Same look as BeltStrip: stripe belts have a lengthwise stripe of the next colour.
  const p = beltPaint(belt || 'White');
  const bg = p.stripe ? `linear-gradient(to bottom, ${p.fill} 0 35%, ${p.stripe} 35% 65%, ${p.fill} 65%)` : p.fill;
  const earned = hasTapes(belt) && tapes ? TAPES.filter((t) => tapes.has(t.id)) : [];
  const band = Math.max(2, Math.round(height / 4.5));
  return (
    <span
      data-belt-tapes={earned.length}
      title={earned.length ? `${belt} · tapes: ${earned.map((t) => t.label).join(', ')}` : belt}
      style={{
        position: 'relative',
        display: 'inline-block',
        width,
        height,
        borderRadius: Math.min(4, height / 3),
        background: bg,
        border: outline || `1px solid ${p.edge}`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        flexShrink: 0,
        verticalAlign: 'middle',
      }}
    >
      {earned.length > 0 && (
        <span style={{ position: 'absolute', top: 0, bottom: 0, right: typeof width === 'number' ? Math.max(3, Math.round(width * 0.08)) : 6, display: 'flex', gap: Math.max(1, Math.round(band / 2)) }}>
          {earned.map((t) => (
            <span key={t.id} style={{ width: band, height: '100%', background: t.color, boxShadow: t.id === 'white' ? 'inset 0 0 0 0.5px #9C988C' : 'inset 0 0 0 0.5px rgba(0,0,0,.18)' }} />
          ))}
        </span>
      )}
    </span>
  );
}
