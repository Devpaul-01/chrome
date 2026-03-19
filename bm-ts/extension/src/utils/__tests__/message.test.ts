/**
 * Tests for src/utils/message.ts
 *
 * Covers:
 *  - shufflePick
 *  - composeMessage
 *  - selectTemplate (gender-aware fallback)
 *  - selectPost     (gender-aware fallback)
 *  - resolveKeywords
 *  - assembleMessageFromTemplate
 */

import { describe, it, expect, vi } from 'vitest';
import type { MessageTemplate, Post } from '../../api/client';
import {
  shufflePick,
  composeMessage,
  selectTemplate,
  selectPost,
  resolveKeywords,
  assembleMessageFromTemplate,
} from '../message';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(
  id: string,
  gender: 'ALL' | 'MALE' | 'FEMALE' | 'NEUTRAL',
  overrides: Partial<MessageTemplate> = {},
): MessageTemplate {
  return {
    id,
    user_id: 'u1',
    title: `Template ${id}`,
    gender,
    greeting: 'Hello',
    sentiment: 'Hope you have a great day',
    closing: 'Best wishes',
    image_url: null,
    days_in_advance: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makePost(id: string, gender: 'MALE' | 'FEMALE' | 'NEUTRAL'): Post {
  return {
    id,
    content: `Content ${id}`,
    gender,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// shufflePick
// ---------------------------------------------------------------------------

describe('shufflePick', () => {
  it('returns an element from the array', () => {
    const items = ['a', 'b', 'c'];
    const result = shufflePick(items);
    expect(items).toContain(result);
  });

  it('works with a single-element array', () => {
    expect(shufflePick(['only'])).toBe('only');
  });

  it('distribution is roughly uniform (smoke test)', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 300; i++) {
      counts[shufflePick(['a', 'b', 'c'])]++;
    }
    // Each bucket should appear at least once
    expect(counts['a']).toBeGreaterThan(0);
    expect(counts['b']).toBeGreaterThan(0);
    expect(counts['c']).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// composeMessage
// ---------------------------------------------------------------------------

describe('composeMessage', () => {
  it('joins one item from each segment list', () => {
    const result = composeMessage(['Hi'], ['good day'], ['Cheers']);
    expect(result).toBe('Hi good day Cheers');
  });

  it('throws when greetings list is empty', () => {
    expect(() => composeMessage([], ['body'], ['close'])).toThrow(
      /at least one entry/i,
    );
  });

  it('throws when bodies list is empty', () => {
    expect(() => composeMessage(['hi'], [], ['close'])).toThrow();
  });

  it('throws when closings list is empty', () => {
    expect(() => composeMessage(['hi'], ['body'], [])).toThrow();
  });

  it('picks from each segment', () => {
    // With Math.random mocked to always return 0 the first item is chosen
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = composeMessage(['A', 'B'], ['X', 'Y'], ['1', '2']);
    expect(result).toBe('A X 1');
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// selectTemplate
// ---------------------------------------------------------------------------

describe('selectTemplate', () => {
  it('returns null for empty list', () => {
    expect(selectTemplate([], 'MALE')).toBeNull();
  });

  it('returns exact gender match when available', () => {
    const templates = [makeTemplate('1', 'ALL'), makeTemplate('2', 'MALE')];
    const result = selectTemplate(templates, 'MALE');
    expect(result?.id).toBe('2');
  });

  it('falls back to "all" gender when no exact match', () => {
    const templates = [makeTemplate('1', 'ALL'), makeTemplate('2', 'FEMALE')];
    const result = selectTemplate(templates, 'MALE');
    expect(result?.id).toBe('1');
  });

  it('falls back to any template when no exact or "all" match', () => {
    const templates = [makeTemplate('1', 'FEMALE')];
    const result = selectTemplate(templates, 'MALE');
    expect(result?.id).toBe('1');
  });

  it('handles NEUTRAL contact gender → maps to "all"', () => {
    const templates = [makeTemplate('1', 'MALE'), makeTemplate('2', 'ALL')];
    const result = selectTemplate(templates, 'NEUTRAL');
    expect(result?.id).toBe('2');
  });

  it('handles undefined contact gender → maps to "all"', () => {
    const templates = [makeTemplate('1', 'ALL')];
    expect(selectTemplate(templates, undefined)?.id).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// selectPost
// ---------------------------------------------------------------------------

describe('selectPost', () => {
  it('returns null for empty list', () => {
    expect(selectPost([], 'MALE')).toBeNull();
  });

  it('returns exact gender match first', () => {
    const posts = [makePost('1', 'NEUTRAL'), makePost('2', 'MALE')];
    expect(selectPost(posts, 'MALE')?.id).toBe('2');
  });

  it('falls back to NEUTRAL when no exact match', () => {
    const posts = [makePost('1', 'FEMALE'), makePost('2', 'NEUTRAL')];
    expect(selectPost(posts, 'MALE')?.id).toBe('2');
  });

  it('falls back to any post when no exact or neutral match', () => {
    const posts = [makePost('1', 'FEMALE')];
    expect(selectPost(posts, 'MALE')?.id).toBe('1');
  });

  it('handles undefined gender → treated as NEUTRAL', () => {
    const posts = [makePost('1', 'NEUTRAL')];
    expect(selectPost(posts, undefined)?.id).toBe('1');
  });
});

// ---------------------------------------------------------------------------
// resolveKeywords
// ---------------------------------------------------------------------------

describe('resolveKeywords', () => {
  const friend = { name: 'Alice' };

  it('replaces [Tag Person] with friend name (case-insensitive)', () => {
    expect(resolveKeywords('Happy birthday [Tag Person]!', friend)).toBe(
      'Happy birthday Alice!',
    );
    expect(resolveKeywords('[tag person] rocks', friend)).toBe('Alice rocks');
  });

  it('replaces [Today] with a localised date string', () => {
    const result = resolveKeywords('Today is [Today].', friend);
    // Should not contain the literal placeholder
    expect(result).not.toContain('[Today]');
    // Should contain a month name and a day number
    expect(result).toMatch(/\w+ \d+/);
  });

  it('removes [Image] placeholder', () => {
    expect(resolveKeywords('See [Image] for details.', friend)).toBe(
      'See  for details.',
    );
  });

  it('handles multiple replacements in one string', () => {
    const result = resolveKeywords(
      'Hi [Tag Person], happy [Today]! [Image]',
      friend,
    );
    expect(result).toContain('Alice');
    expect(result).not.toContain('[Tag Person]');
    expect(result).not.toContain('[Today]');
    expect(result).not.toContain('[Image]');
  });

  it('is a no-op when no keywords present', () => {
    expect(resolveKeywords('No placeholders here.', friend)).toBe(
      'No placeholders here.',
    );
  });
});

// ---------------------------------------------------------------------------
// assembleMessageFromTemplate
// ---------------------------------------------------------------------------

describe('assembleMessageFromTemplate', () => {
  it('joins greeting, sentiment, and closing with keyword resolution', () => {
    const template = makeTemplate('1', 'ALL', {
      greeting: 'Hi [Tag Person]',
      sentiment: 'hope your day is great',
      closing: 'Cheers',
    });
    const result = assembleMessageFromTemplate(template, { name: 'Bob' });
    expect(result).toBe('Hi Bob hope your day is great Cheers');
  });

  it('filters out empty parts', () => {
    const template = makeTemplate('1', 'ALL', {
      greeting: 'Hey',
      sentiment: '',
      closing: 'Bye',
    });
    const result = assembleMessageFromTemplate(template, { name: 'Bob' });
    expect(result).toBe('Hey Bye');
  });
});
