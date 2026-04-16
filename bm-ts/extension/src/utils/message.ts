import type { MessageTemplate, Post } from '../api/client';

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

export type Gender = 'MALE' | 'FEMALE' | 'NEUTRAL' | undefined;
type TemplateGender = MessageTemplate['gender']; // 'ALL' | 'MALE' | 'FEMALE' | 'NEUTRAL'

function contactGenderToTemplateGender(g: Gender): TemplateGender {
  if (g === 'MALE') return 'MALE';
  if (g === 'FEMALE') return 'FEMALE';
  return 'ALL';
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Select the best matching MessageTemplate for a given contact gender and group.
 * Priority: group+gender match → group only → gender match → 'all' → any template.
 */
export function selectTemplate(
  templates: MessageTemplate[],
  gender: Gender,
  groupId?: string | null,
): MessageTemplate | null {
  if (!templates.length) return null;
  const gKey = contactGenderToTemplateGender(gender);

  // If a groupId is provided, prefer templates in that group
  if (groupId) {
    const inGroup = templates.filter((t) => t.group_id === groupId);
    if (inGroup.length) {
      const exactGroup = inGroup.filter((t) => t.gender === gKey);
      if (exactGroup.length) return pickRandom(exactGroup);
      const allGroup = inGroup.filter((t) => t.gender === 'ALL');
      if (allGroup.length) return pickRandom(allGroup);
      return pickRandom(inGroup);
    }
  }

  // Fall back to ungrouped templates first, then any
  const ungrouped = templates.filter((t) => !t.group_id);
  const pool = ungrouped.length ? ungrouped : templates;
  const exact = pool.filter((t) => t.gender === gKey);
  if (exact.length) return pickRandom(exact);
  const allGender = pool.filter((t) => t.gender === 'ALL');
  if (allGender.length) return pickRandom(allGender);
  return pickRandom(pool);
}

/**
 * Select the best matching timeline Post for a given contact gender and group.
 * Priority: group+gender match → group only → gender match → NEUTRAL → any post.
 */
export function selectPost(posts: Post[], gender: Gender, groupId?: string | null): Post | null {
  if (!posts.length) return null;
  const gKey = (gender ?? 'NEUTRAL') as Post['gender'];

  // If a groupId is provided, prefer posts in that group
  if (groupId) {
    const inGroup = posts.filter((p) => p.group_id === groupId);
    if (inGroup.length) {
      const exactGroup = inGroup.filter((p) => p.gender === gKey);
      if (exactGroup.length) return pickRandom(exactGroup);
      const neutralGroup = inGroup.filter((p) => p.gender === 'NEUTRAL');
      if (neutralGroup.length) return pickRandom(neutralGroup);
      return pickRandom(inGroup);
    }
  }

  // Fall back to ungrouped posts first, then any
  const ungrouped = posts.filter((p) => !p.group_id);
  const pool = ungrouped.length ? ungrouped : posts;
  const exact = pool.filter((p) => p.gender === gKey);
  if (exact.length) return pickRandom(exact);
  const neutral = pool.filter((p) => p.gender === 'NEUTRAL');
  if (neutral.length) return pickRandom(neutral);
  return pickRandom(pool);
}

// ---------------------------------------------------------------------------
// Keyword resolution
// [Tag Person]   → friend's full name
// [Today]        → localised date string
// [Image]        → stripped (image attached separately via clipboard)
// {First_Name}   → friend's first name (curly-brace style used in post editor)
// {Last_Name}    → friend's last name (or full name if single word)
// {Today}        → localised date string (curly-brace style used in post editor)
// ---------------------------------------------------------------------------

export function resolveKeywords(text: string, friend: { name: string }): string {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const nameParts = friend.name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
  return text
    .replace(/\[Tag Person\]/gi, friend.name)
    .replace(/\[Today\]/gi, today)
    .replace(/\[Image\]/gi, '')
    .replace(/\{First_Name\}/gi, firstName)
    .replace(/\{Last_Name\}/gi, lastName)
    .replace(/\{Today\}/gi, today);
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
