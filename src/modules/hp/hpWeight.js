// Weight tracking: loading and saving. Logic lives in hpWeightLogic.js.
import { supabase } from '../../supabaseClient';

export * from './hpWeightLogic';


async function must(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data || [];
}

export async function loadWeights(athleteIds) {
  if (!athleteIds.length) return [];
  return must(supabase.from('hp_weights').select('*').in('athlete_id', athleteIds).order('date').limit(5000));
}

export async function addWeight(athleteId, date, weightKg, note) {
  await must(supabase.from('hp_weights').insert({ athlete_id: athleteId, date, weight_kg: weightKg, note: note || null }));
}

export async function deleteWeight(id) {
  await must(supabase.from('hp_weights').delete().eq('id', id));
}

export async function setWeightLimit(athleteId, limit) {
  await must(supabase.from('hp_athletes').update({ weight_limit: limit }).eq('id', athleteId));
}
