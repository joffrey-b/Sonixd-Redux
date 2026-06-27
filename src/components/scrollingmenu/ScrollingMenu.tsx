import React, { useRef } from 'react';
import styled from 'styled-components';
import { ButtonGroup, ButtonToolbar, FlexboxGrid } from 'rsuite';
import ArrowLeftIcon from '@rsuite/icons/legacy/ArrowLeft';
import ArrowRightIcon from '@rsuite/icons/legacy/ArrowRight';
import Card from '../card/Card';
import { SectionTitleWrapper, SectionTitle, StyledButton } from '../shared/styled';
import { useAppSelector } from '../../redux/hooks';
import { smoothScroll } from '../../shared/utils';
import { Item } from '../../types';
import { settings } from '../shared/bridge';
import type { RowDataType } from 'rsuite-table';

const ScrollMenuContainer = styled.div<{ $noScrollbar?: boolean; $maxWidth: string }>`
  overflow-x: auto;
  white-space: nowrap;

  max-width: ${(props) => props.$maxWidth};

  &::-webkit-scrollbar {
    height: ${(props) => (props.$noScrollbar ? '0px' : '10px')};
  }
`;

interface CardConfig {
  property: string;
  urlProperty?: string;
  prefix?: string;
  unit?: string | false;
}

interface ScrollingMenuProps {
  cardTitle: CardConfig;
  cardSubtitle: CardConfig | string;
  data: unknown[];
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  onClickTitle?: () => void;
  type?: string;
  handleFavorite?: (rowData: RowDataType) => unknown;
  noScrollbar?: boolean;
  cardSize?: number;
  maxWidth?: string;
  noButtons?: boolean;
}

const ScrollingMenu = ({
  cardTitle,
  cardSubtitle,
  data,
  title,
  subtitle,
  onClickTitle,
  type,
  handleFavorite,
  noScrollbar,
  cardSize,
  maxWidth,
  noButtons,
}: ScrollingMenuProps) => {
  const cacheImages = Boolean(settings.get('cacheImages'));
  const misc = useAppSelector((state) => state.misc);
  const config = useAppSelector((state) => state.config);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <SectionTitleWrapper $maxWidth={maxWidth}>
        <FlexboxGrid justify="space-between" style={{ alignItems: 'flex-end' }}>
          <FlexboxGrid.Item>
            <SectionTitle
              tabIndex={0}
              onClick={onClickTitle}
              onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  onClickTitle?.();
                }
              }}
            >
              {title}
            </SectionTitle>
            {subtitle}
          </FlexboxGrid.Item>
          <FlexboxGrid.Item>
            {data.length > 0 && !noButtons && (
              <ButtonToolbar>
                <ButtonGroup>
                  <StyledButton
                    aria-label="scroll left"
                    size="sm"
                    appearance="subtle"
                    onClick={() => {
                      const el = scrollContainerRef.current;
                      if (!el) return;
                      smoothScroll(
                        400,
                        el,
                        el.scrollLeft - (cardSize || config.lookAndFeel.gridView.cardSize) * 5,
                        'scrollLeft'
                      );
                    }}
                  >
                    <ArrowLeftIcon />
                  </StyledButton>
                  <StyledButton
                    aria-label="scroll right"
                    size="sm"
                    appearance="subtle"
                    onClick={() => {
                      const el = scrollContainerRef.current;
                      if (!el) return;
                      smoothScroll(
                        400,
                        el,
                        el.scrollLeft + (cardSize || config.lookAndFeel.gridView.cardSize) * 5,
                        'scrollLeft'
                      );
                    }}
                  >
                    <ArrowRightIcon />
                  </StyledButton>
                </ButtonGroup>
              </ButtonToolbar>
            )}
          </FlexboxGrid.Item>
        </FlexboxGrid>
      </SectionTitleWrapper>

      <ScrollMenuContainer
        ref={scrollContainerRef}
        $noScrollbar={noScrollbar}
        $maxWidth={maxWidth ?? '100%'}
      >
        {(data as Record<string, unknown>[]).map((item) => (
          <span key={item.id as string} style={{ display: 'inline-block' }}>
            <Card
              itemId={item.id}
              title={item[cardTitle.property] || item.title}
              subtitle={
                typeof cardSubtitle === 'string'
                  ? cardSubtitle
                  : cardSubtitle.unit
                    ? `${item[cardSubtitle.property]}${cardSubtitle.unit}`
                    : item[cardSubtitle.property]
              }
              coverArt={item.image}
              url={
                cardTitle.urlProperty
                  ? `${cardTitle.prefix}/${type === Item.Music ? item.albumId : item.id}`
                  : undefined
              }
              subUrl={
                typeof cardSubtitle !== 'string' && cardSubtitle.urlProperty
                  ? `${cardSubtitle.prefix}/${item[cardSubtitle.urlProperty]}`
                  : undefined
              }
              playClick={type === Item.Music ? item : { type, id: item.id }}
              details={{ cacheType: type, ...item }}
              hasHoverButtons
              size={cardSize || config.lookAndFeel.gridView.cardSize}
              lazyLoad
              cacheImages={cacheImages}
              cachePath={misc.imageCachePath}
              style={{ margin: '5px' }}
              handleFavorite={handleFavorite}
            />
          </span>
        ))}
      </ScrollMenuContainer>
    </>
  );
};

export default ScrollingMenu;
