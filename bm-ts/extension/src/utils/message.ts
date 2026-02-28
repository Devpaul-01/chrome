import type { MessageTemplate, Contact, Post } from '../api/client';

export function shufflePick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

export function composeMessage(greetings: string[], bodies: string[], closings: string[]): string {
  if (!greetings.length || !bodies.length || !closings.length) {
    throw new Error('Each segment type must have at least one entry');
  }
  return `${shufflePick(greetings)} ${shufflePick(bodies)} ${shufflePick(closings)}`;
}

export function randomDelay(msMin = 5000, msMax = 15000): Promise<void> {
  const delay = Math.random() * (msMax - msMin) + msMin;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// ---------------------------------------------------------------------------
// Template & Post selection (gender-aware, with fallback to 'all' / any)
// ---------------------------------------------------------------------------

type Gender = Contact['gender']; // 'MALE' | 'FEMALE' | 'NEUTRAL' | undefined
type TemplateGender = MessageTemplate['gender']; // 'all' | 'male' | 'female'

function contactGenderToTemplateGender(g: Gender): TemplateGender {
  if (g === 'MALE') return 'male';
  if (g === 'FEMALE') return 'female';
  return 'all';
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Select the best matching MessageTemplate for a given contact gender.
 * Priority: exact gender match → 'all' → any template.
 */
export function selectTemplate(
  templates: MessageTemplate[],
  gender: Gender,
): MessageTemplate | null {
  if (!templates.length) return null;
  const gKey = contactGenderToTemplateGender(gender);
  const exact = templates.filter((t) => t.gender === gKey);
  if (exact.length) return pickRandom(exact);
  const allGender = templates.filter((t) => t.gender === 'all');
  if (allGender.length) return pickRandom(allGender);
  return pickRandom(templates);
}

/**
 * Select the best matching timeline Post for a given contact gender.
 * Priority: exact gender match → NEUTRAL → any post.
 */
export function selectPost(posts: Post[], gender: Gender): Post | null {
  if (!posts.length) return null;
  const gKey = (gender ?? 'NEUTRAL') as Post['gender'];
  const exact = posts.filter((p) => p.gender === gKey);
  if (exact.length) return pickRandom(exact);
  const neutral = posts.filter((p) => p.gender === 'NEUTRAL');
  if (neutral.length) return pickRandom(neutral);
  return pickRandom(posts);
}

// ---------------------------------------------------------------------------
// Keyword resolution
// [Tag Person] → friend's name
// [Today]      → localised date string
// [Image]      → stripped (image attached separately via clipboard)
// ---------------------------------------------------------------------------

export function resolveKeywords(
  text: string,
  friend: { name: string },
): string {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return text
    .replace(/\[Tag Person\]/gi, friend.name)
    .replace(/\[Today\]/gi, today)
    .replace(/\[Image\]/gi, '');
}

/**
 * Assemble the full birthday DM text from a MessageTemplate.
 * Applies keyword resolution to all three segment fields.
 */
export function assembleMessageFromTemplate(
  template: MessageTemplate,
  friend: { name: string },
): string {
  return [template.greeting, template.sentiment, template.closing]
    .map((part) => resolveKeywords(part, friend))
    .filter(Boolean)
    .join(' ');
}
