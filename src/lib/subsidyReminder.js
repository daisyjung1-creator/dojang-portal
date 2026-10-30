// Fills the sports-grant reminder template (Invoice Settings → Subsidy reminder).
// Keep in sync with fillSubsidyTemplate in supabase/functions/send-emails/invoiceDocs.ts.
export const SUBSIDY_PLACEHOLDERS = ['{student}', '{student_full}', '{guardian}', '{subsidy}', '{end_month}', '{end_date}', '{business}'];

export const DEFAULT_SUBSIDY_SUBJECT = 'Sports grant ending soon for {student}';

export function fillSubsidyTemplate(tpl, student, settings = {}) {
  const end = student.subsidy_end_date ? new Date(student.subsidy_end_date + 'T00:00:00') : null;
  const endMonth = end ? end.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }) : '';
  const endDate = end ? end.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  return String(tpl || '')
    .replaceAll('{student_full}', student.name || '')
    .replaceAll('{student}', (student.name || '').split(' ')[0])
    .replaceAll('{guardian}', student.guardian_name || '')
    .replaceAll('{subsidy}', student.subsidy_name || 'sports grant')
    .replaceAll('{end_month}', endMonth)
    .replaceAll('{end_date}', endDate)
    .replaceAll('{business}', settings.business_name || '');
}
