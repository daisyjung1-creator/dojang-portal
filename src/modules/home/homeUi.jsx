import React from 'react';
import { styles } from '../../lib/uiStyles';

// Small building blocks shared by the Home cards.
export const GREEN = ['var(--dp-success)', 'var(--dp-success-tint)', 'var(--dp-success-tint)'];
export const BLUE = ['var(--dp-info)', 'var(--dp-canvas)', 'var(--dp-line)'];
export const RED = ['var(--dp-danger)', 'var(--dp-danger-tint)', 'var(--dp-danger-tint)'];
export const AMBER = ['var(--dp-warning)', 'var(--dp-warning-tint)', 'var(--dp-warning-tint)'];
export const PURPLE = ['var(--dp-ink-soft)', 'var(--dp-canvas)', 'var(--dp-line)'];
export const GREY = ['var(--dp-ink-soft)', 'var(--dp-canvas)', 'var(--dp-line)'];
export const smallBtn = { padding: '2px 10px', fontSize: 12 };
// Staff iPad (Today): 44px touch targets, DESIGN.md sizes.
export const touchBtn = { minHeight: 'var(--dp-touch)', padding: '8px 14px', fontSize: 'var(--dp-text-label)', fontWeight: 600 };
export const touchLinkBtn = { background: 'none', border: 'none', minHeight: 'var(--dp-touch)', padding: '0 4px', color: 'var(--dp-info)', textDecoration: 'underline', textUnderlineOffset: 3, cursor: 'pointer', fontSize: 'var(--dp-text-label)', fontFamily: 'inherit' };
export const linkBtn = { background: 'none', border: 'none', padding: '0 6px 0 0', color: 'var(--dp-info)', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' };

export function Tag({ c, children, touch }) {
  if (touch) return <span style={{ marginLeft: 8, fontSize: 'var(--dp-text-label)', fontWeight: 500, color: c[0], background: c[1], borderRadius: 'var(--dp-radius-pill)', padding: '2px 10px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>{children}</span>;
  return <span style={{ marginLeft: 6, fontSize: 12.5, color: c[0], border: `1px solid ${c[2]}`, background: c[1], borderRadius: 999, padding: '1px 6px', whiteSpace: 'nowrap', fontWeight: 400 }}>{children}</span>;
}

export function Card({ title, icon: Icon, action, tone, children, touch }) {
  if (touch) {
    return (
      <div style={{ background: 'var(--dp-paper)', border: '1px solid var(--dp-line)', borderRadius: 'var(--dp-radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', minHeight: 64, borderBottom: '1px solid var(--dp-line)' }}>
          {Icon && <Icon size={18} color="var(--dp-ink-soft)" aria-hidden="true" />}
          <h2 style={{ fontSize: 'var(--dp-text-title)', fontWeight: 600, flex: 1, margin: 0, color: 'var(--dp-ink)' }}>{title}</h2>
          {action}
        </div>
        {children}
      </div>
    );
  }
  return (
    <div style={{ ...styles.card, ...(tone === 'bad' ? { borderColor: 'var(--dp-danger-tint)' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: '1px solid #EDEAE0' }}>
        {Icon && <Icon size={15} color={tone === 'bad' ? 'var(--dp-danger)' : 'var(--dp-ink-soft)'} />}
        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, color: tone === 'bad' ? 'var(--dp-danger)' : 'var(--dp-ink)' }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

export const Empty = ({ children, touch }) => <p style={touch ? { padding: '16px', margin: 0, fontSize: 'var(--dp-text-body)', color: 'var(--dp-ink-soft)' } : { padding: '12px 14px', margin: 0, fontSize: 13, color: 'var(--dp-ink-faint)' }}>{children}</p>;

