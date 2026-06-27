import React, { useState } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { useNavigate } from 'react-router-dom';
import { InputGroup } from 'rsuite';
import CloseIcon from '@rsuite/icons/legacy/Close';
import SearchIcon from '@rsuite/icons/legacy/Search';
import ViewTypeButtons from '../viewtypes/ViewTypeButtons';
import {
  StyledIconButton,
  StyledInput,
  StyledInputGroup,
  StyledInputGroupButton,
} from '../shared/styled';
import {
  CoverArtWrapper,
  CustomImageGrid,
  CustomImageGridWrapper,
  PageHeaderSubtitleWrapper,
  PageHeaderTitle,
  PageHeaderWrapper,
} from './styled';
import cacheImage from '../shared/cacheImage';
import { settings } from '../shared/bridge';
import CustomTooltip from '../shared/CustomTooltip';

interface CacheImagesConfig {
  enabled: boolean;
  cacheType: string;
  id: string;
}

interface GenericPageHeaderProps {
  image?: string | string[] | React.ReactNode;
  imageHeight?: number;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  sidetitle?: React.ReactNode;
  subsidetitle?: React.ReactNode;
  searchQuery?: string;
  clearSearchQuery?: () => void;
  handleSearch?: (v: string) => void;
  showViewTypeButtons?: boolean;
  showSearchBar?: boolean;
  handleListClick?: () => void;
  handleGridClick?: () => void;
  viewTypeSetting?: string;
  cacheImages?: CacheImagesConfig;
  showTitleTooltip?: boolean;
  isDark?: boolean;
}

const GenericPageHeader = ({
  image,
  imageHeight,
  title,
  subtitle,
  sidetitle,
  subsidetitle,
  searchQuery,
  clearSearchQuery,
  handleSearch,
  showViewTypeButtons,
  showSearchBar,
  handleListClick,
  handleGridClick,
  viewTypeSetting,
  cacheImages,
  showTitleTooltip,
  isDark,
}: GenericPageHeaderProps) => {
  const navigate = useNavigate();
  const [openSearch, setOpenSearch] = useState(false);

  return (
    <>
      {image && !Array.isArray(image) && (
        <CoverArtWrapper $size={imageHeight || 195} $card={typeof image !== 'string'}>
          {typeof image !== 'string' ? (
            <>{image}</>
          ) : (
            <LazyLoadImage
              src={image}
              alt="header-img"
              height={imageHeight || 195}
              visibleByDefault
              afterLoad={() => {
                if (cacheImages?.enabled && settings.get('cacheImages')) {
                  cacheImage(
                    `${cacheImages.cacheType}_${cacheImages.id}.jpg`,
                    image.replaceAll(/=150/gi, '=350')
                  );
                }
              }}
            />
          )}
        </CoverArtWrapper>
      )}

      {image && Array.isArray(image) && (
        <CoverArtWrapper $size={imageHeight ?? 195}>
          <CustomImageGridWrapper>
            <CustomImageGrid $gridArea="1 / 1 / 2 / 2">
              {image[0] && (
                <LazyLoadImage
                  src={image[0]}
                  alt="header-img"
                  height={(imageHeight ?? 0) / 2}
                  width={(imageHeight ?? 0) / 2}
                />
              )}
            </CustomImageGrid>
            <CustomImageGrid $gridArea="1 / 2 / 2 / 3">
              {image[1] && (
                <LazyLoadImage
                  src={image[1]}
                  alt="header-img"
                  height={(imageHeight ?? 0) / 2}
                  width={(imageHeight ?? 0) / 2}
                />
              )}
            </CustomImageGrid>
            <CustomImageGrid $gridArea="2 / 1 / 3 / 2">
              {image[2] && (
                <LazyLoadImage
                  src={image[2]}
                  alt="header-img"
                  height={(imageHeight ?? 0) / 2}
                  width={(imageHeight ?? 0) / 2}
                />
              )}
            </CustomImageGrid>
            <CustomImageGrid $gridArea="2 / 2 / 3 / 3">
              {image[3] && (
                <LazyLoadImage
                  src={image[3]}
                  alt="header-img"
                  height={(imageHeight ?? 0) / 2}
                  width={(imageHeight ?? 0) / 2}
                />
              )}
            </CustomImageGrid>
          </CustomImageGridWrapper>
        </CoverArtWrapper>
      )}

      <PageHeaderWrapper $isDark={isDark} $hasImage={!!image} $imageHeight={imageHeight || 195}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: 'flex',
              width: '80%',
              overflow: 'hidden',
            }}
          >
            {showTitleTooltip ? (
              <CustomTooltip text={title} placement="bottom">
                <PageHeaderTitle>{title}</PageHeaderTitle>
              </CustomTooltip>
            ) : (
              <PageHeaderTitle>{title}</PageHeaderTitle>
            )}
          </span>
          <span
            style={{
              alignSelf: 'center',
            }}
          >
            {sidetitle && <span style={{ display: 'inline-block' }}>{sidetitle}</span>}
            {showSearchBar && (
              <span style={{ display: 'inline-block' }}>
                {searchQuery !== '' || openSearch ? (
                  <StyledInputGroup inside>
                    <InputGroup.Addon>
                      <SearchIcon />
                    </InputGroup.Addon>
                    <StyledInput
                      $opacity={0.6}
                      id="local-search-input"
                      value={searchQuery}
                      onChange={handleSearch}
                      onPressEnter={() => {
                        if (searchQuery?.trim()) {
                          navigate(`/search?query=${searchQuery}`);
                        }
                      }}
                      onKeyDown={(e: KeyboardEvent) => {
                        if (e.key === 'Escape') {
                          clearSearchQuery?.();
                          setOpenSearch(false);
                        }
                      }}
                      style={{ width: '180px' }}
                    />
                    <StyledInputGroupButton
                      tabIndex={0}
                      appearance="subtle"
                      onClick={() => {
                        clearSearchQuery?.();
                        setOpenSearch(false);
                      }}
                      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                          clearSearchQuery?.();
                          setOpenSearch(false);
                        }
                      }}
                    >
                      <CloseIcon />
                    </StyledInputGroupButton>
                  </StyledInputGroup>
                ) : (
                  <StyledIconButton
                    onClick={() => {
                      setOpenSearch(true);
                      setTimeout(() => {
                        const searchInput = document.getElementById(
                          'local-search-input'
                        ) as HTMLInputElement;
                        searchInput.focus();
                        searchInput.select();
                      }, 50);
                    }}
                    appearance="subtle"
                    icon={<SearchIcon />}
                  />
                )}
              </span>
            )}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'visible',
            minHeight: 0,
          }}
        >
          <PageHeaderSubtitleWrapper>{subtitle}</PageHeaderSubtitleWrapper>
          <span style={{ alignSelf: 'flex-end' }}>
            {subsidetitle && <span style={{ display: 'inline-block' }}>{subsidetitle}</span>}
            {showViewTypeButtons && (
              <span style={{ display: 'inline-block' }}>
                <ViewTypeButtons
                  handleListClick={handleListClick ?? (() => {})}
                  handleGridClick={handleGridClick ?? (() => {})}
                  viewTypeSetting={viewTypeSetting ?? ''}
                />
              </span>
            )}
          </span>
        </div>
      </PageHeaderWrapper>
    </>
  );
};

export default GenericPageHeader;
