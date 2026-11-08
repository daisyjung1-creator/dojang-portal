import React from 'react';
import { HeartPulse, CameraOff } from 'lucide-react';

// Small alerts next to a student's name: medical info coaches should know,
// and "no photos" when the family said NO to promotional photos/videos.
export default function StudentFlags({ s, size = 14, style }) {
  if (!s) return null;
  const med = String(s.medical || '').trim();
  const noPhoto = s.photo_consent === false;
  if (!med && !noPhoto) return null;
  const chip = (bg, color) => ({ display: 'inline-flex', alignItems: 'center', gap: 3, background: bg, color, borderRadius: 999, padding: '1px 6px', fontSize: 11, fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap', cursor: 'help' });
  return (
    <span style={{ display: 'inline-flex', gap: 4, verticalAlign: 'middle', ...style }}>
      {med && (
        <span title={`Medical: ${med}`} aria-label={`Medical: ${med}`} style={chip('#FBEAEA', '#9A2B2B')} onClick={(e) => { e.stopPropagation(); window.alert(`${s.name} — medical:\n\n${med}`); }}>
          <HeartPulse size={size - 2} /> Medical
        </span>
      )}
      {noPhoto && (
        <span title="No promotional photos or videos" aria-label="No photos" style={chip('#EEF0F3', '#3A4250')}>
          <CameraOff size={size - 2} /> No photos
        </span>
      )}
    </span>
  );
}
