import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Icon } from 'rsuite';
import format from 'format-duration';
import { InfoModal } from '../modal/Modal';
import { LyricsData } from '../../hooks/useGetLyrics';
import { StyledIconButton } from '../shared/styled';
import Slider from '../slider/Slider';

const ModalInner = styled.div`
  display: flex;
  flex-direction: column;
  height: 75vh;
`;

const LyricsContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 8px;
`;

const Line = styled.p<{ $active: boolean; $past: boolean; $clickable: boolean }>`
  text-align: center;
  margin: 6px 0;
  padding: 4px 16px;
  border-radius: 4px;
  font-size: ${(p) => (p.$active ? '1.1em' : '1em')};
  font-weight: ${(p) => (p.$active ? '600' : 'normal')};
  opacity: ${(p) => {
    if (p.$active) return 1;
    if (p.$past) return 0.35;
    return 0.6;
  }};
  transition: opacity 0.3s ease, font-size 0.2s ease;
  line-height: 1.7;
  cursor: ${(p) => (p.$clickable ? 'pointer' : 'default')};
  &:hover {
    opacity: ${(p) => (p.$clickable ? 0.9 : undefined)};
    background: ${(p) => (p.$clickable ? 'rgba(255,255,255,0.05)' : 'transparent')};
  }
`;

const Controls = styled.div`
  padding: 12px 16px 8px;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
`;

const SeekRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
`;

const TimeLabel = styled.span`
  font-size: 0.75em;
  opacity: 0.55;
  min-width: 36px;
  user-select: none;
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
`;

const ZoomRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
`;

const ZoomLabel = styled.span`
  font-size: 0.72em;
  opacity: 0.5;
  min-width: 28px;
  text-align: center;
  user-select: none;
`;

const SongHeader = styled.div`
  text-align: center;
  padding: 12px 16px 0;
  flex-shrink: 0;
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.75;
`;

interface Props {
  show: boolean;
  handleHide: () => void;
  lyrics: LyricsData | null | undefined;
  currentTime: number;
  duration: number;
  playerStatus: string;
  title?: string;
  artist?: string;
  handlePlayPause: () => void;
  handlePrevTrack: () => void;
  handleNextTrack: () => void;
  handleSeekSlider: (e: number) => void;
}

const LyricsModal = ({
  show,
  handleHide,
  lyrics,
  currentTime,
  duration,
  playerStatus,
  title,
  artist,
  handlePlayPause,
  handlePrevTrack,
  handleNextTrack,
  handleSeekSlider,
}: Props) => {
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('lyricsFontSize');
    return saved ? Number(saved) : 15;
  });
  // Keep the last valid lyrics while a new song's lyrics are loading so the
  // modal never unmounts mid-transition (prevents the visible flash).
  const lastLyricsRef = useRef<LyricsData | null>(null);
  // When lyrics change, the active-line scroll fires with a stale currentTime
  // (still at the end of the previous song) and overrides the scroll-to-top.
  // This flag tells the scroll effect to skip one cycle after a song change.
  const skipNextScrollRef = useRef(false);
  if (lyrics?.lines?.length) {
    lastLyricsRef.current = lyrics;
  }

  // Clear stale lyrics when the modal is closed so reopening starts fresh.
  useEffect(() => {
    if (!show) {
      lastLyricsRef.current = null;
    }
  }, [show]);

  const displayLyrics = lyrics?.lines?.length ? lyrics : lastLyricsRef.current;

  const currentTimeMs = currentTime * 1000;

  const activeIndex = useMemo(() => {
    if (!displayLyrics?.synced || !displayLyrics.lines.length) return -1;
    let idx = -1;
    for (let i = 0; i < displayLyrics.lines.length; i += 1) {
      if (displayLyrics.lines[i].time !== null && displayLyrics.lines[i].time! <= currentTimeMs) {
        idx = i;
      }
    }
    return idx;
  }, [displayLyrics, currentTimeMs]);

  // Reset scroll to top when the song changes, and flag the next active-line
  // scroll to be skipped so the stale-currentTime smooth scroll can't undo it.
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      skipNextScrollRef.current = true;
    }
  }, [lyrics]);

  // Scroll active line into view.
  useEffect(() => {
    if (skipNextScrollRef.current) {
      skipNextScrollRef.current = false;
      return;
    }
    if (!show) return;
    // Song restarted (previous button) or seeked before the first line.
    if (activeIndex < 0 && displayLyrics?.synced && containerRef.current) {
      containerRef.current.scrollTop = 0;
      return;
    }
    if (activeIndex >= 0 && lineRefs.current[activeIndex]) {
      lineRefs.current[activeIndex]!.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [show, activeIndex, displayLyrics?.synced]);

  if (!displayLyrics?.lines?.length) return null;

  return (
    <InfoModal width="560px" show={show} handleHide={handleHide}>
      <ModalInner>
        {(title || artist) && (
          <SongHeader>{artist && title ? `${artist} — ${title}` : artist || title}</SongHeader>
        )}
        <LyricsContainer ref={containerRef} style={{ fontSize }}>
          {displayLyrics.lines.map((line, i) => (
            <Line
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              ref={(el) => {
                lineRefs.current[i] = el;
              }}
              $active={i === activeIndex}
              $past={displayLyrics.synced && activeIndex >= 0 && i < activeIndex}
              $clickable={displayLyrics.synced && line.time !== null}
              onClick={() => {
                if (displayLyrics.synced && line.time !== null) {
                  handleSeekSlider(line.time / 1000);
                }
              }}
            >
              {line.text}
            </Line>
          ))}
        </LyricsContainer>
        <Controls>
          <SeekRow>
            <TimeLabel>{format(currentTime * 1000)}</TimeLabel>
            <div style={{ flex: 1 }}>
              <Slider
                value={currentTime}
                min={0}
                max={duration || 0}
                onAfterChange={handleSeekSlider}
                toolTipType="time"
              />
            </div>
            <TimeLabel style={{ textAlign: 'right' }}>{format(duration * 1000)}</TimeLabel>
          </SeekRow>
          <ButtonRow>
            <StyledIconButton
              appearance="subtle"
              icon={<Icon icon="step-backward" />}
              onClick={handlePrevTrack}
            />
            <StyledIconButton
              appearance="subtle"
              size="lg"
              icon={<Icon icon={playerStatus === 'PLAYING' ? 'pause-circle' : 'play-circle'} />}
              onClick={handlePlayPause}
            />
            <StyledIconButton
              appearance="subtle"
              icon={<Icon icon="step-forward" />}
              onClick={handleNextTrack}
            />
          </ButtonRow>
          <ZoomRow>
            <ZoomLabel>A</ZoomLabel>
            <div style={{ width: 80 }}>
              <Slider
                min={10}
                max={28}
                step={1}
                value={fontSize}
                onAfterChange={(val: number) => {
                  setFontSize(val);
                  localStorage.setItem('lyricsFontSize', String(val));
                }}
              />
            </div>
            <ZoomLabel style={{ fontSize: '1em' }}>A</ZoomLabel>
          </ZoomRow>
        </Controls>
      </ModalInner>
    </InfoModal>
  );
};

export default LyricsModal;
