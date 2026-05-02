import { useQuery } from 'react-query';
import { apiController } from '../api/controller';
import { ConfigPage } from '../redux/configSlice';
import { Server } from '../types';

export interface LyricLine {
  time: number | null; // milliseconds from start of track, null for unsynced
  text: string;
}

export interface LyricsData {
  lines: LyricLine[];
  synced: boolean;
}

// Strip LRC metadata tags like [ti:Title], [ar:Artist], [offset:+500], etc.
// Time tags [MM:SS.xx] are left intact.
const stripLrcMetadata = (line: string) => line.replace(/\[(?!\d{2}:\d{2}\.)[^\]]*\]/g, '');

const parseLrc = (text: string): LyricsData | null => {
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
  const lines: LyricLine[] = [];
  let hasTimes = false;

  for (const rawLine of text.split('\n')) {
    const cleaned = stripLrcMetadata(rawLine);
    const matches = [...cleaned.matchAll(timeRegex)];
    const lineText = cleaned.replace(timeRegex, '').trim();

    if (matches.length > 0) {
      hasTimes = true;
      if (lineText) {
        for (const m of matches) {
          const ms =
            (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000 +
            (m[3].length === 2 ? parseInt(m[3], 10) * 10 : parseInt(m[3], 10));
          lines.push({ time: ms, text: lineText });
        }
      }
    } else if (lineText) {
      lines.push({ time: null, text: lineText });
    }
  }

  if (!hasTimes) return null;
  return { lines: lines.sort((a, b) => (a.time ?? 0) - (b.time ?? 0)), synced: true };
};

const useGetLyrics = (
  config: ConfigPage,
  options: { id?: string; artist?: string; title?: string }
) => {
  const { data } = useQuery<LyricsData | null>(
    ['lyrics', options.id, options.artist, options.title],
    async () => {
      // Try OpenSubsonic getLyricsBySongId first — returns structured lines with ms timestamps
      if (options.id) {
        try {
          const structured = await apiController({
            serverType: config.serverType,
            endpoint: 'getLyricsBySongId',
            args: { id: options.id },
          });
          if (structured?.line?.length) {
            return {
              lines: structured.line.map((l: any) => ({
                time: structured.synced ? (l.start as number) : null,
                text: l.value as string,
              })),
              synced: Boolean(structured.synced),
            };
          }
        } catch {
          // Server doesn't support the OpenSubsonic extension, fall through
        }
      }

      // Fall back to standard getLyrics — may be LRC-formatted or plain text
      if (options.artist && options.title) {
        const plain: string | undefined = await apiController({
          serverType: config.serverType,
          endpoint: 'getLyrics',
          args: { artist: options.artist, title: options.title },
        });
        if (plain) {
          const lrc = parseLrc(plain);
          if (lrc) return lrc;
          // Plain text — split into lines, no timestamps
          return {
            lines: plain
              .split('\n')
              .map((t) => t.trim())
              .filter(Boolean)
              .map((text) => ({ time: null, text })),
            synced: false,
          };
        }
      }

      return null;
    },
    {
      enabled: (!!options.id || !!options.artist) && config.serverType === Server.Subsonic,
    }
  );

  return { data };
};

export default useGetLyrics;
