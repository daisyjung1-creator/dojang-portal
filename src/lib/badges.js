// Small counts next to the sidebar tabs: things waiting for you there.
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { todayISO } from './billingDates';
import { lowRows } from './stock';

const count = (r) => (r && !r.error ? r.count ?? (r.data || []).length : 0);

export async function loadBadges() {
  const today = todayISO();
  const [leads, toText, regs, declined, overdue, stock, todos, staffNotes, swaps] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'New Inquiry'),
    // Trials booked online with a phone only: confirm by text.
    supabase.from('tryouts').select('id', { count: 'exact', head: true }).eq('confirmation_sent', false).is('guardian_email', null).not('guardian_phone', 'is', null).gte('date', today).neq('status', 'Cancelled'),
    supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('customers').select('id', { count: 'exact', head: true }).not('card_profile_code', 'is', null).not('card_declined_at', 'is', null).neq('active', false),
    supabase.from('invoice_summary').select('id, due_date, invoice_date, voided').gt('balance', 0).eq('voided', false),
    supabase.from('inventory_levels').select('*'),
    supabase.from('dashboard_notes').select('id, note_date, auto_key').eq('done', false),
    // Staff Clock: unread notes from staff and shift swaps waiting for approval.
    supabase.from('staff_clock_notes').select('id', { count: 'exact', head: true }).eq('author', 'employee').eq('read', false),
    supabase.from('staff_clock_swaps').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const late = (overdue.data || []).filter((i) => (i.due_date || i.invoice_date) < today).length;
  const due = (todos.data || []).filter((t) => t.auto_key || (t.note_date && t.note_date <= today)).length;
  return {
    home: due + count(staffNotes),
    clock: count(staffNotes) + count(swaps),
    leads: count(leads) + count(toText),
    register: count(regs),
    billing: count(declined),
    invoices: late,
    inventory: lowRows(stock.data || []).length,
  };
}

// Reloaded when you switch tabs and every 2 minutes.
export function useBadges(enabled, activeTab) {
  const [badges, setBadges] = useState({});
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const run = () => loadBadges().then((b) => alive && setBadges(b)).catch(() => {});
    run();
    const t = setInterval(run, 120000);
    window.addEventListener('dp-badges', run);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('dp-badges', run);
    };
  }, [enabled, activeTab]);
  return badges;
}

// Call after saving something that changes a count (e.g. ticking a to-do).
export const refreshBadges = () => window.dispatchEvent(new Event('dp-badges'));
