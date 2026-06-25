// The real SK8 DICE game: 4 dice, each with 6 word faces. You roll all four and
// do the trick spelled out. "SK8" / "✗" are wildcards — excluded from the trick
// (the classic "exclude that die" rule), so a roll can yield 1–4 words.

export interface SkateDie {
  key: string;
  // 6 faces, in BoxGeometry material order [+X, -X, +Y, -Y, +Z, -Z].
  faces: string[];
  color: string; // label tint
}

export const WILDCARDS = ['SK8', '✗'];

export const SKATE_DICE: SkateDie[] = [
  {
    key: 'stance',
    color: '#DA552F',
    faces: ['Regular', 'Switch', 'Nollie', 'Fakie', 'SK8', '✗'],
  },
  {
    key: 'side',
    color: '#2563EB',
    faces: ['Frontside', 'Backside', 'Frontside', 'Backside', 'SK8', '✗'],
  },
  {
    key: 'spin',
    color: '#059669',
    faces: ['180', '360', '180', '360', 'SK8', '✗'],
  },
  {
    // Pure flips only — the SPIN die supplies rotation, so no "varial/360 flip"
    // double-counting. (e.g. Frontside + 360 + Kickflip reads as a real trick.)
    key: 'flip',
    color: '#9333EA',
    faces: ['Kickflip', 'Heelflip', 'Pop Shuvit', 'Kickflip', 'SK8', '✗'],
  },
];

export const isWildcard = (face: string) => WILDCARDS.includes(face);

// Combine the four rolled faces into a trick name (wildcards dropped).
export function trickFromFaces(faces: string[]): string {
  const words = faces.filter((f) => !isWildcard(f));
  if (words.length === 0) return "Skater's choice!";
  return words.join(' ');
}
