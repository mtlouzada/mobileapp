// Funny hype/taunt lines for the Skate-or-Dice character. "{t}" is replaced by
// the rolled trick (highlighted in the speech balloon).
const SENTENCES: string[] = [
  'Bet you can’t land a {t} 😏',
  'Okay hotshot — send it: {t}!',
  'Land a {t} or you buy the crew pizza 🍕',
  'Easy. Just a casual {t}, no big deal.',
  '{t}? Pics or it didn’t happen 📸',
  'Warm-up’s over. {t}, let’s go!',
  'Your nan could do a {t}. Prove me wrong.',
  'Roll away clean: {t} 🛹',
  'Sketchy or steezy? Show me a {t}.',
  'First try {t} or it’s a coffee run ☕',
  'Commit to the {t}. Don’t kook it.',
  '{t}. Bend those knees, champ.',
  'Three tries for a {t}. Clock’s ticking ⏱️',
  'Stomp a {t} and I’ll stop heckling.',
  'Nollie crew hates this one trick: {t}',
];

const PROMPTS: string[] = [
  'Tap PLAY and I’ll hook you up with a trick 🛹',
  'Ready to roll? Hit PLAY, hotshot.',
  'Shake the phone or smash PLAY 🎲',
];

export function randomSentenceTemplate(): string {
  return SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
}

export function randomPrompt(): string {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

// Split a "{t}" template into the text before/after the trick token.
export function splitTemplate(template: string): { before: string; after: string } {
  const i = template.indexOf('{t}');
  if (i === -1) return { before: template, after: '' };
  return { before: template.slice(0, i), after: template.slice(i + 3) };
}
