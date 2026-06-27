import { evaluateRule, evaluateRules } from '../shared/smartPlaylistRules';
import { SmartPlaylistRule } from '../types';

const rule = (
  field: SmartPlaylistRule['field'],
  operator: SmartPlaylistRule['operator'],
  value: SmartPlaylistRule['value'],
  value2?: number
): SmartPlaylistRule => ({ id: '1', field, operator, value, value2 });

// ─── genre ────────────────────────────────────────────────────────────────────

describe('evaluateRule — genre', () => {
  const rockSong = { genre: [{ title: 'Rock' }] };
  const popSong = { genre: [{ title: 'Pop' }, { title: 'Electronic' }] };

  it('is — matches case-insensitively', () => {
    expect(evaluateRule(rule('genre', 'is', 'rock'), rockSong)).toBe(true);
    expect(evaluateRule(rule('genre', 'is', 'ROCK'), rockSong)).toBe(true);
  });

  it('is — returns false when genre is absent', () => {
    expect(evaluateRule(rule('genre', 'is', 'rock'), {})).toBe(false);
  });

  it('is — matches one of multiple genres', () => {
    expect(evaluateRule(rule('genre', 'is', 'pop'), popSong)).toBe(true);
    expect(evaluateRule(rule('genre', 'is', 'electronic'), popSong)).toBe(true);
  });

  it('isNot — excludes the specified genre', () => {
    expect(evaluateRule(rule('genre', 'isNot', 'rock'), rockSong)).toBe(false);
    expect(evaluateRule(rule('genre', 'isNot', 'jazz'), rockSong)).toBe(true);
  });

  it('isNot — returns true when genre list is empty', () => {
    expect(evaluateRule(rule('genre', 'isNot', 'rock'), { genre: [] })).toBe(true);
  });

  it('handles genre as plain string array', () => {
    const song = { genre: ['Rock', 'Blues'] };
    expect(evaluateRule(rule('genre', 'is', 'rock'), song)).toBe(true);
  });
});

// ─── year ─────────────────────────────────────────────────────────────────────

describe('evaluateRule — year', () => {
  it('is — exact match', () => {
    expect(evaluateRule(rule('year', 'is', 2000), { year: 2000 })).toBe(true);
    expect(evaluateRule(rule('year', 'is', 2001), { year: 2000 })).toBe(false);
  });

  it('gt — greater than', () => {
    expect(evaluateRule(rule('year', 'gt', 1999), { year: 2000 })).toBe(true);
    expect(evaluateRule(rule('year', 'gt', 2000), { year: 2000 })).toBe(false);
  });

  it('gte — greater than or equal', () => {
    expect(evaluateRule(rule('year', 'gte', 2000), { year: 2000 })).toBe(true);
    expect(evaluateRule(rule('year', 'gte', 2001), { year: 2000 })).toBe(false);
  });

  it('lt — less than', () => {
    expect(evaluateRule(rule('year', 'lt', 2001), { year: 2000 })).toBe(true);
    expect(evaluateRule(rule('year', 'lt', 2000), { year: 2000 })).toBe(false);
  });

  it('lte — less than or equal', () => {
    expect(evaluateRule(rule('year', 'lte', 2000), { year: 2000 })).toBe(true);
    expect(evaluateRule(rule('year', 'lte', 1999), { year: 2000 })).toBe(false);
  });

  it('between — inclusive range', () => {
    const r = rule('year', 'between', 1990, 2000);
    expect(evaluateRule(r, { year: 1990 })).toBe(true);
    expect(evaluateRule(r, { year: 2000 })).toBe(true);
    expect(evaluateRule(r, { year: 1995 })).toBe(true);
    expect(evaluateRule(r, { year: 1989 })).toBe(false);
    expect(evaluateRule(r, { year: 2001 })).toBe(false);
  });

  it('returns false when song has no year', () => {
    expect(evaluateRule(rule('year', 'is', 2000), {})).toBe(false);
    expect(evaluateRule(rule('year', 'gte', 1990), {})).toBe(false);
  });
});

// ─── playCount ────────────────────────────────────────────────────────────────

describe('evaluateRule — playCount', () => {
  it('is — equality', () => {
    expect(evaluateRule(rule('playCount', 'is', 5), { playCount: 5 })).toBe(true);
    expect(evaluateRule(rule('playCount', 'is', 4), { playCount: 5 })).toBe(false);
  });

  it('gte — treats missing playCount as 0', () => {
    expect(evaluateRule(rule('playCount', 'gte', 0), {})).toBe(true);
    expect(evaluateRule(rule('playCount', 'gte', 1), {})).toBe(false);
  });

  it('gt — greater than', () => {
    expect(evaluateRule(rule('playCount', 'gt', 4), { playCount: 5 })).toBe(true);
    expect(evaluateRule(rule('playCount', 'gt', 5), { playCount: 5 })).toBe(false);
  });

  it('lt — less than', () => {
    expect(evaluateRule(rule('playCount', 'lt', 6), { playCount: 5 })).toBe(true);
    expect(evaluateRule(rule('playCount', 'lt', 5), { playCount: 5 })).toBe(false);
  });

  it('lte — less than or equal', () => {
    expect(evaluateRule(rule('playCount', 'lte', 5), { playCount: 5 })).toBe(true);
    expect(evaluateRule(rule('playCount', 'lte', 4), { playCount: 5 })).toBe(false);
  });
});

// ─── rating ───────────────────────────────────────────────────────────────────

describe('evaluateRule — rating', () => {
  it('returns false when rating is 0 (unrated)', () => {
    expect(evaluateRule(rule('rating', 'gte', 0), { userRating: 0 })).toBe(false);
    expect(evaluateRule(rule('rating', 'is', 0), { userRating: 0 })).toBe(false);
  });

  it('returns false when userRating is missing', () => {
    expect(evaluateRule(rule('rating', 'is', 3), {})).toBe(false);
  });

  it('is — exact rating match', () => {
    expect(evaluateRule(rule('rating', 'is', 4), { userRating: 4 })).toBe(true);
    expect(evaluateRule(rule('rating', 'is', 3), { userRating: 4 })).toBe(false);
  });

  it('gte — at least N stars', () => {
    expect(evaluateRule(rule('rating', 'gte', 3), { userRating: 4 })).toBe(true);
    expect(evaluateRule(rule('rating', 'gte', 5), { userRating: 4 })).toBe(false);
  });

  it('lte — at most N stars', () => {
    expect(evaluateRule(rule('rating', 'lte', 4), { userRating: 3 })).toBe(true);
    expect(evaluateRule(rule('rating', 'lte', 2), { userRating: 3 })).toBe(false);
  });
});

// ─── starred ──────────────────────────────────────────────────────────────────

describe('evaluateRule — starred', () => {
  it('is true — matches starred song (boolean true)', () => {
    expect(evaluateRule(rule('starred', 'is', true), { starred: true })).toBe(true);
  });

  it('is true — matches starred song (truthy string)', () => {
    expect(evaluateRule(rule('starred', 'is', true), { starred: '2024-01-01' })).toBe(true);
  });

  it('is false — matches unstarred song', () => {
    expect(evaluateRule(rule('starred', 'is', false), { starred: false })).toBe(true);
    expect(evaluateRule(rule('starred', 'is', false), { starred: true })).toBe(false);
  });

  it('is true — returns false for unstarred song', () => {
    expect(evaluateRule(rule('starred', 'is', true), { starred: false })).toBe(false);
    expect(evaluateRule(rule('starred', 'is', true), {})).toBe(false);
  });
});

// ─── duration ─────────────────────────────────────────────────────────────────

describe('evaluateRule — duration', () => {
  const song3min = { duration: 180 }; // 3 minutes exactly

  it('gt — longer than N minutes', () => {
    expect(evaluateRule(rule('duration', 'gt', 2), song3min)).toBe(true);
    expect(evaluateRule(rule('duration', 'gt', 3), song3min)).toBe(false);
  });

  it('lt — shorter than N minutes', () => {
    expect(evaluateRule(rule('duration', 'lt', 4), song3min)).toBe(true);
    expect(evaluateRule(rule('duration', 'lt', 3), song3min)).toBe(false);
  });

  it('between — inclusive range in minutes', () => {
    const r = rule('duration', 'between', 2, 5);
    expect(evaluateRule(r, { duration: 150 })).toBe(true); // 2.5 min
    expect(evaluateRule(r, { duration: 60 })).toBe(false); // 1 min
  });

  it('treats missing duration as 0 seconds (0 minutes)', () => {
    expect(evaluateRule(rule('duration', 'gt', 0), {})).toBe(false);
    expect(evaluateRule(rule('duration', 'lt', 1), {})).toBe(true);
  });
});

// ─── unknown field ────────────────────────────────────────────────────────────

describe('evaluateRule — unknown field', () => {
  it('returns false without throwing for an unknown field', () => {
    const r = {
      id: '1',
      field: 'bitrate' as SmartPlaylistRule['field'],
      operator: 'is' as const,
      value: 320,
    };
    expect(() => evaluateRule(r, {})).not.toThrow();
    expect(evaluateRule(r, {})).toBe(false);
  });
});

// ─── evaluateRules ────────────────────────────────────────────────────────────

describe('evaluateRules', () => {
  const song = { year: 2000, playCount: 10, starred: true };

  it('ALL mode: returns true only when all rules pass', () => {
    const rules = [rule('year', 'is', 2000), rule('playCount', 'gte', 5)];
    expect(evaluateRules(rules, song, 'ALL')).toBe(true);
  });

  it('ALL mode: returns false when any rule fails', () => {
    const rules = [
      rule('year', 'is', 2000),
      rule('playCount', 'gte', 20), // fails
    ];
    expect(evaluateRules(rules, song, 'ALL')).toBe(false);
  });

  it('ANY mode: returns true when at least one rule passes', () => {
    const rules = [
      rule('year', 'is', 1999), // fails
      rule('playCount', 'gte', 5), // passes
    ];
    expect(evaluateRules(rules, song, 'ANY')).toBe(true);
  });

  it('ANY mode: returns false when all rules fail', () => {
    const rules = [rule('year', 'is', 1999), rule('playCount', 'gte', 20)];
    expect(evaluateRules(rules, song, 'ANY')).toBe(false);
  });

  it('empty rules array returns true (no filter applied)', () => {
    expect(evaluateRules([], song, 'ALL')).toBe(true);
    expect(evaluateRules([], song, 'ANY')).toBe(true);
  });

  it('defaults to ALL mode when no mode is provided', () => {
    const passingRules = [rule('year', 'is', 2000)];
    expect(evaluateRules(passingRules, song)).toBe(true);
  });
});
