// Curriculum tapes: colour-belt students earn 7 tapes for their current belt
// (white, orange, red, purple, brown, blue, green), ticked by instructors.
// What each tape covers will be filled in later.
import { supabase } from '../supabaseClient';
import { BELTS } from './constants';
import { fetchAll } from '../modules/invoices/api';

export const TAPES = [
  { id: 'white', label: 'White', color: '#FFFFFF', border: '#BDB9AC', text: '#20241F' },
  { id: 'orange', label: 'Orange', color: '#EE8A2A', border: '#C46A12', text: '#fff' },
  { id: 'red', label: 'Red', color: '#C62828', border: '#8E1B1B', text: '#fff' },
  { id: 'purple', label: 'Purple', color: '#6A3FA0', border: '#4B2B75', text: '#fff' },
  { id: 'brown', label: 'Brown', color: '#7A5034', border: '#563722', text: '#fff' },
  { id: 'blue', label: 'Blue', color: '#1F63B5', border: '#154780', text: '#fff' },
  { id: 'green', label: 'Green', color: '#2E7D32', border: '#1F5A23', text: '#fff' },
];
export const TAPE_COUNT = TAPES.length;

// Colour belts (White … Red) use tapes; black stripes and black belts don't.
const RED = BELTS.findIndex((b) => b.value === 'Red');
export const hasTapes = (belt) => {
  const i = BELTS.findIndex((b) => b.value === (belt || 'White'));
  return i >= 0 && i <= RED;
};

// student_id -> Set of tapes earned for the belt they hold now.
export async function loadTapes(students) {
  const { data } = await fetchAll(() => supabase.from('student_tapes').select('student_id, belt, tape, earned_on'));
  const beltOf = Object.fromEntries((students || []).map((s) => [s.id, s.belt || 'White']));
  const out = {};
  (data || []).forEach((r) => {
    if (beltOf[r.student_id] !== undefined && r.belt === beltOf[r.student_id]) (out[r.student_id] ||= new Set()).add(r.tape);
  });
  return out;
}

export async function setTape(student, tape, on) {
  const belt = student.belt || 'White';
  if (on) return supabase.from('student_tapes').upsert({ student_id: student.id, belt, tape }, { onConflict: 'student_id,belt,tape', ignoreDuplicates: true });
  return supabase.from('student_tapes').delete().eq('student_id', student.id).eq('belt', belt).eq('tape', tape);
}
