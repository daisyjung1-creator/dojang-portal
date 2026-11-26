import React from 'react';
import { HeartPulse, CameraOff } from 'lucide-react';
import { notice } from '../lib/dialogs';

// Small alerts next to a student's name: medical info coaches should know,
// and "no photos" when the family said NO to promotional photos/videos.
export default function StudentFlags({ s, size = 14, style, hideMedical = false, compact = false }) {
  if (!s) return null;
  const med = hideMedical ? '' : String(s.medical || '').trim();
  const noPhoto = s.photo_consent === false;
  if (!med && !noPhoto) return null;
  const chip = (bg, color) => ({ display: 'inline-flex', alignItems: 'center', gap: 3, background: bg, color, borderRadius: 999, padding: '1px 6px', fontSize: 12, fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap', cursor: 'help' });
  return (
    <span style={{ display: 'inline-flex', gap: 4, verticalAlign: 'middle', ...style }}>
      {med && (
        <span title={`Medical: ${med}`} aria-label={`Medical: ${med}`} style={chip('var(--dp-danger-tint)', 'var(--dp-danger)')} onClick={(e) => { e.stopPropagation(); notice(med, { title: `${s.name} — medical` }); }}>
          <HeartPulse size={size - 2} /> Medical
        </span>
      )}
      {noPhoto && (
        <span title="No promotional photos or videos" aria-label="No photos" style={chip('var(--dp-canvas)', 'var(--dp-ink-soft)')}>
          <CameraOff size={size - 2} />{!compact && ' No photos'}
        </span>
      )}
    </span>
  );
}
