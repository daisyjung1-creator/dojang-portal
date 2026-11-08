import React from 'react';
import mark from '../assets/logo-mark.png';

// The Hankook claw mark on a white tile (reads on the dark sidebar too).
export default function BrandMark({ size = 26 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: 6, background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
      <img src={mark} alt="" style={{ width: size - 2, height: size - 2, objectFit: 'contain' }} />
    </span>
  );
}
