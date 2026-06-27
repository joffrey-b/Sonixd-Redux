import { parseLrc, LyricsData } from '../hooks/useGetLyrics';

function assertParsed(result: LyricsData | null): LyricsData {
  expect(result).not.toBeNull();
  if (!result) throw new Error('parseLrc returned null unexpectedly');
  return result;
}

describe('parseLrc — timestamp formats', () => {
  it('parses standard [MM:SS.xx] timestamps correctly', () => {
    const result = assertParsed(parseLrc('[01:23.45]Hello world'));
    // 1*60 + 23 = 83 s = 83000 ms; hundredths: 45 * 10 = 450 ms → 83450 ms total
    expect(result.lines[0].time).toBe(83450);
    expect(result.lines[0].text).toBe('Hello world');
  });

  it('parses [MM:SS.xxx] three-digit millisecond timestamps correctly', () => {
    const result = assertParsed(parseLrc('[01:23.450]Hello world'));
    // 83000 ms + 450 ms = 83450 ms
    expect(result.lines[0].time).toBe(83450);
  });

  it('parses [MM:SS] timestamps without milliseconds (treating ms as 0)', () => {
    const result = assertParsed(parseLrc('[01:23]Hello world'));
    // 83 seconds = 83000 ms
    expect(result.lines[0].time).toBe(83000);
  });

  it('strips UTF-8 BOM (\\uFEFF) from the beginning of the file', () => {
    const result = assertParsed(parseLrc('﻿[00:01.00]First line'));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe('First line');
  });

  it('handles CRLF line endings', () => {
    const result = assertParsed(parseLrc('[00:01.00]Line one\r\n[00:02.00]Line two'));
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].text).toBe('Line one');
    expect(result.lines[1].text).toBe('Line two');
  });

  it('skips metadata lines ([ar:], [ti:], [al:])', () => {
    const input = '[ar:Artist Name]\n[ti:Song Title]\n[al:Album]\n[00:01.00]Lyric line';
    const result = assertParsed(parseLrc(input));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe('Lyric line');
  });

  it('returns lyrics in chronological order regardless of input order', () => {
    const result = assertParsed(parseLrc('[00:30.00]Third\n[00:10.00]First\n[00:20.00]Second'));
    expect(result.lines[0].text).toBe('First');
    expect(result.lines[1].text).toBe('Second');
    expect(result.lines[2].text).toBe('Third');
  });

  it('returns null for an empty string without throwing', () => {
    expect(parseLrc('')).toBeNull();
  });

  it('returns null for a file with only metadata and no lyric lines', () => {
    expect(parseLrc('[ar:Some Artist]\n[ti:Some Title]\n[al:Some Album]')).toBeNull();
  });

  it('creates one entry per time tag when a line carries multiple time tags', () => {
    const result = assertParsed(parseLrc('[00:10.00][01:10.00]Chorus lyrics'));
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toEqual({ time: 10000, text: 'Chorus lyrics' });
    expect(result.lines[1]).toEqual({ time: 70000, text: 'Chorus lyrics' });
  });

  it('marks results with synced:true when time tags are present', () => {
    const result = assertParsed(parseLrc('[00:01.00]Hello'));
    expect(result.synced).toBe(true);
  });

  it('strips offset metadata but preserves lyric lines', () => {
    const result = assertParsed(parseLrc('[offset:+500]\n[00:05.00]Hello'));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].text).toBe('Hello');
  });
});
