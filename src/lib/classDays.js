import { supabase } from '../supabaseClient';

// After a student's class days are set, remove the automatic "absent" marks
// on days that aren't theirs (they were never expected then).
export async function clearOffDayAbsences(studentId, classDays) {
  if (!classDays || !classDays.length) return 0;
  const { data } = await supabase.from('attendance').select('id, date, class_name').eq('student_id', studentId).eq('status', 'absent').eq('auto', true);
  const off = (data || []).filter((a) => !classDays.includes(`${new Date(a.date + 'T00:00:00').getDay()}:${a.class_name}`)).map((a) => a.id);
  if (off.length) await supabase.from('attendance').delete().in('id', off);
  return off.length;
}
