import { supabase as client } from '../../supabaseClient';

// The Staff Clock screens came from the old clock-in app (attendance-portal).
// Its tables live in this database under staff_clock_* names; this keeps the
// old screen code readable by mapping the old table names.
const TABLES = {
  employees: 'staff_clock_employees',
  entries: 'staff_clock_entries',
  schedule: 'staff_clock_shifts',
  notes: 'staff_clock_notes',
  swap_requests: 'staff_clock_swaps',
  audit_log: 'staff_clock_audit',
  time_off: 'staff_clock_time_off',
  schedule_events: 'staff_clock_events',
  admin_settings: 'staff_clock_settings',
};

export const supabase = {
  from: (t) => client.from(TABLES[t] || t),
  rpc: (...args) => client.rpc(...args),
};

// Plain-text email to the dojang's notification address or an employee,
// sent through the portal's email queue (send-emails).
export async function notifyEmail(toEmail, subject, text) {
  if (!toEmail) return;
  const { error } = await client.rpc('staff_clock_notify', { p_to: toEmail, p_subject: subject, p_message: text });
  if (error) console.error('Email notification failed', error.message);
}

export async function checkPin(employeeId, pin) {
  const { data, error } = await client.rpc('staff_clock_check_pin', { p_employee: employeeId, p_pin: pin });
  if (error) throw error;
  return !!data;
}

// Admin: PINs are kept in their own admin-only table.
export async function loadPins() {
  const { data } = await client.from('staff_clock_pins').select('employee_id, pin');
  return Object.fromEntries((data || []).map((r) => [r.employee_id, r.pin]));
}
export async function savePin(employeeId, pin) {
  return client.from('staff_clock_pins').upsert({ employee_id: employeeId, pin }, { onConflict: 'employee_id' });
}

// Admin: email a picture of the month schedule to every employee (one email
// each, so addresses aren't shared), plus a copy to the notification email.
export async function emailScheduleImage(recipients, subject, text, fileName, base64) {
  const { data: att, error: attErr } = await client
    .from('email_attachments')
    .insert({ file_name: fileName, mime: 'image/png', size_bytes: Math.round((base64.length * 3) / 4), data: base64 })
    .select('id')
    .single();
  if (attErr) return { error: attErr };
  const rows = recipients.map((to) => ({ type: 'broadcast', recipient_email: to, payload: { source: 'staff_clock', subject, message: text, attachments: [att.id] } }));
  return client.from('email_queue').insert(rows);
}
