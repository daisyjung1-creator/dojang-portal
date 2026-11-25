// Awards handed out at a belt test.
//   · Medal: for a strong test — 7 or more of the 8 report ranks at ES
//     (5 sections + 3 mental values; a section the belt doesn't do can't count).
//   · Character patches: chosen by the instructors from what the student has
//     shown in class. A student receives each patch only once.
// `intro` is read out when the patch is presented (printed on the awards list).
import { summarize } from './testScoring';

export const PATCHES = [
  { name: 'Presentation', intro: 'The Presentation patch goes to a student who always shows up ready — uniform neat, belt tied properly, standing tall. How we present ourselves shows respect for the dojang, for our instructors and for ourselves.' },
  { name: 'Honor', intro: 'The Honor patch goes to a student who does the right thing even when no one is watching. They keep their word and make our dojang proud.' },
  { name: 'Dress', intro: 'The Dress patch goes to a student who wears their dobok with pride — clean, neat and complete every class. Taking care of our uniform is the first step in taking care of our training.' },
  { name: 'Honesty', intro: 'The Honesty patch goes to a student who always tells the truth — about their effort, their mistakes and their scores. Honest martial artists earn the trust of everyone around them.' },
  { name: 'Confidence', intro: 'The Confidence patch goes to a student who believes in themselves. They step forward, use a strong voice and keep going — even when something is new or difficult.' },
  { name: 'Passion', intro: 'The Passion patch goes to a student who truly loves Taekwondo. Their energy and excitement in every class inspire everyone around them.' },
  { name: 'Courage', intro: 'The Courage patch goes to a student who is brave enough to try, even when they feel nervous — in sparring, in board breaking and in front of the class. Courage is not having no fear; it is doing your best anyway.' },
  { name: 'Effort', intro: 'The Effort patch goes to a student who gives one hundred percent every single class. They never hold back, and their hard work shows in everything they do.' },
  { name: 'Perseverance', intro: 'The Perseverance patch goes to a student who never gives up. When something is hard, they keep practicing until they get it. That is the Indomitable Spirit of Taekwondo.' },
  { name: 'Cooperation', intro: 'The Cooperation patch goes to a student who works well with everyone — holding targets, helping partners and making the whole class better.' },
  { name: 'Courtesy', intro: 'The Courtesy patch goes to a student who is always polite and respectful. They bow with meaning, listen carefully and treat everyone with kindness — the first tenet of Taekwondo.' },
  { name: 'Friendship', intro: 'The Friendship patch goes to a student who makes everyone feel welcome. They include new students, cheer for their classmates and make our dojang feel like family.' },
  { name: 'Consideration', intro: 'The Consideration patch goes to a student who thinks of others first. They notice when someone needs help and are always thoughtful and caring.' },
];

export const MEDAL_INTRO =
  'Medals go to students who performed at a high level across the whole test — poomsae, basics, kicking, sparring, board breaking and attitude. Please give them a big round of applause!';

export const MEDAL_MIN = 7;

// How many sections and mental values are at ES (Exceeds Standard).
export function goodCount(scores, currentBelt) {
  const sum = summarize(scores, currentBelt);
  return [...sum.sections.map((x) => x.rank), ...sum.mental.map((m) => m.rank)].filter((r) => r === 'ES').length;
}
