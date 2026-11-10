// Competition records: loading and saving.
import { supabase } from '../../supabaseClient';

async function must(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data || [];
}

export const PLACEMENTS = ['Gold', 'Silver', 'Bronze', '5th', 'Participated', 'Withdrew'];
export const ROUNDS = ['Round of 64', 'Round of 32', 'Round of 16', 'Quarterfinal', 'Semifinal', 'Final', 'Repechage', 'Exhibition'];

export async function loadCompetitions(athleteId) {
  const comps = await must(supabase.from('hp_competitions').select('*').eq('athlete_id', athleteId).order('date', { ascending: false }));
  const ids = comps.map((c) => c.id);
  const matches = ids.length
    ? await must(supabase.from('hp_matches').select('*').in('competition_id', ids).order('sort'))
    : [];
  return comps.map((c) => ({ ...c, matches: matches.filter((m) => m.competition_id === c.id) }));
}

export async function saveCompetition(fields, id) {
  if (id) await must(supabase.from('hp_competitions').update(fields).eq('id', id));
  else await must(supabase.from('hp_competitions').insert(fields));
}

export async function deleteCompetition(id) {
  await must(supabase.from('hp_competitions').delete().eq('id', id));
}

export async function saveMatch(fields, id) {
  if (id) await must(supabase.from('hp_matches').update(fields).eq('id', id));
  else await must(supabase.from('hp_matches').insert(fields));
}

export async function deleteMatch(id) {
  await must(supabase.from('hp_matches').delete().eq('id', id));
}

/** Wins / losses / medals over a list of competitions. */
export function record(comps) {
  const matches = comps.flatMap((c) => c.matches);
  return {
    wins: matches.filter((m) => m.result === 'W').length,
    losses: matches.filter((m) => m.result === 'L').length,
    medals: Object.fromEntries(['Gold', 'Silver', 'Bronze'].map((p) => [p, comps.filter((c) => c.placement === p).length])),
  };
}
