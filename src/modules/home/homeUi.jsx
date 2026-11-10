import React from 'react';
import { styles } from '../../lib/uiStyles';

// Small building blocks shared by the Home cards.
export const GREEN = ['#2A5A30', '#E8F1E9', '#BFDCC3'];
export const BLUE = ['#1E4566', '#E6F0F6', '#B9D3E4'];
export const RED = ['#9A2B2B', '#FBEAEA', '#EBC3C3'];
export const AMBER = ['#854F0B', '#FAEEDA', '#F0D9A8'];
export const PURPLE = ['#4B3A86', '#EEEAF6', '#D2C9EA'];
export const GREY = ['#5B5F56', '#F1EFE7', '#DEDACC'];
export const smallBtn = { padding: '2px 10px', fontSize: 12 };
export const linkBtn = { background: 'none', border: 'none', padding: '0 6px 0 0', color: '#1E4566', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' };

export function Tag({ c, children }) {
  return <span style={{ marginLeft: 6, fontSize: 10.5, color: c[0], border: `1px solid ${c[2]}`, background: c[1], borderRadius: 999, padding: '1px 6px', whiteSpace: 'nowrap', fontWeight: 400 }}>{children}</span>;
}

export function Card({ title, icon: Icon, action, tone, children }) {
  return (
    <div style={{ ...styles.card, ...(tone === 'bad' ? { borderColor: '#EBC3C3' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: '1px solid #EDEAE0' }}>
        {Icon && <Icon size={15} color={tone === 'bad' ? '#9A2B2B' : '#5B5F56'} />}
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, color: tone === 'bad' ? '#9A2B2B' : '#20241F' }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

export const Empty = ({ children }) => <p style={{ padding: '12px 14px', margin: 0, fontSize: 13, color: '#8A8D84' }}>{children}</p>;

