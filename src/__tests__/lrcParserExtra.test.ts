import { parseLrc, LyricsData } from '../hooks/useGetLyrics';

function assertParsed(result: LyricsData | null): LyricsData {
  if (!result) throw new Error('parseLrc returned null unexpectedly');
  return result;
}

// ─── edge cases not covered by lrcParser.test.ts ──────────────────────────────

describe('parseLrc — additional edge cases', () => {
  it('handles a file with BOM and one lyric line', () => {
    // BOM followed by a real lyric line should parse correctly
    const result = assertParsed(parseLrc('﻿[00:05.00]Hello'));
    expect(result.lines[0].text).toBe('Hello');
    expect(result.lines[0].time).toBe(5000);
  });

  it('returns null for a file with only BOM and no content', () => {
    expect(parseLrc('﻿')).toBeNull();
  });

  it('returns null for a file with only whitespace', () => {
    expect(parseLrc('   \n   \n   ')).toBeNull();
  });

  it('handles large timestamps (>60 minutes) in MM:SS format', () => {
    // [75:30.00] = 75*60*1000 + 30*1000 = 4530000ms
    const result = assertParsed(parseLrc('[75:30.00]Long track'));
    expect(result.lines[0].time).toBe(75 * 60 * 1000 + 30 * 1000);
  });

  it('handles very large timestamps without overflow', () => {
    // [99:59.99] = 99*60*1000 + 59*1000 + 990 = 5999990ms ≈ 100 minutes
    const result = assertParsed(parseLrc('[99:59.99]End of track'));
    expect(result.lines[0].time).toBe(99 * 60 * 1000 + 59 * 1000 + 990);
  });

  it('includes both entries when two lines share the same timestamp', () => {
    const lrc = '[00:05.00]First\n[00:05.00]Second';
    const result = assertParsed(parseLrc(lrc));
    const atFive = result.lines.filter((l) => l.time === 5000);
    expect(atFive).toHaveLength(2);
  });

  it('does not strip HTML-like tags from lyric text (preserves them as-is)', () => {
    // The parser has no HTML stripping — this documents the actual behaviour
    const result = assertParsed(parseLrc('[00:05.00]Hello <b>world</b>'));
    expect(result.lines[0].text).toBe('Hello <b>world</b>');
  });

  it('handles zero-padded minutes and seconds correctly', () => {
    const result = assertParsed(parseLrc('[00:00.00]Start\n[00:01.00]One second'));
    expect(result.lines[0].time).toBe(0);
    expect(result.lines[1].time).toBe(1000);
  });

  it('handles a file where the last line has no trailing newline', () => {
    const result = assertParsed(parseLrc('[00:01.00]First\n[00:02.00]Last'));
    expect(result.lines).toHaveLength(2);
    expect(result.lines[1].text).toBe('Last');
  });

  it('handles mixed MM:SS and MM:SS.xx timestamps in the same file', () => {
    const lrc = '[00:05]Without ms\n[00:10.50]With ms';
    const result = assertParsed(parseLrc(lrc));
    expect(result.lines[0].time).toBe(5000);
    expect(result.lines[1].time).toBe(10500);
  });

  it('returns entries sorted even when input is out of chronological order', () => {
    const lrc = '[00:30.00]Later\n[00:10.00]Earlier\n[00:20.00]Middle';
    const result = assertParsed(parseLrc(lrc));
    const times = result.lines.map((l) => l.time);
    expect(times).toEqual([10000, 20000, 30000]);
  });

  it('handles Windows CRLF line endings throughout the entire file', () => {
    const lrc = '[ar:Artist]\r\n[ti:Title]\r\n[00:05.00]Line one\r\n[00:10.00]Line two\r\n';
    const result = assertParsed(parseLrc(lrc));
    expect(result.lines).toHaveLength(2);
    // CRLF means the text will have a trailing \r; trim is applied in the parser
    expect(result.lines[0].text).toBe('Line one');
    expect(result.lines[1].text).toBe('Line two');
  });

  it('hour-style HH:MM:SS timestamp [01:02:03.45] is NOT parsed as a time tag', () => {
    // The regex requires [MM:SS] with exactly 2-digit groups; HH:MM:SS does not match
    const result = parseLrc('[01:02:03.45]This has no valid time tag');
    // No valid timestamp → returns null
    expect(result).toBeNull();
  });

  it('three-character milliseconds [MM:SS.xxx] are parsed correctly', () => {
    const result = assertParsed(parseLrc('[01:23.450]Song lyric'));
    // 1*60*1000 + 23*1000 + 450 = 83450ms
    expect(result.lines[0].time).toBe(83450);
  });
});
