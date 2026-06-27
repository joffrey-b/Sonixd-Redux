import React from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import cacheImage from '../../shared/cacheImage';
import { settings } from '../../shared/bridge';
import useIsCached from '../../../hooks/useIsCached';
import { CoverArtWrapper } from '../../layout/styled';

// Shared cover-art image used by CoverArtCell and ListViewTable's combined-title
// cell -- both rendered the same cache-aware <LazyLoadImage> inline. Extracted
// so the cache-existence check (now async, see useIsCached) can live in a real
// component rather than a per-row render-prop callback, where hooks can't run.
interface CachedCoverArtProps {
  fileName: string;
  fallbackSrc: string;
  cachePath: string;
  size: number;
  cacheEnabled: boolean;
}

const CachedCoverArt = ({
  fileName,
  fallbackSrc,
  cachePath,
  size,
  cacheEnabled,
}: CachedCoverArtProps) => {
  const filePath = `${cachePath}${fileName}`;
  const cached = useIsCached(filePath);

  return (
    <CoverArtWrapper $size={size}>
      <LazyLoadImage
        src={cached ? filePath : fallbackSrc}
        alt="track-img"
        effect="opacity"
        width={size}
        height={size}
        visibleByDefault
        afterLoad={() => {
          if (cacheEnabled && settings.get('cacheImages')) {
            cacheImage(fileName, fallbackSrc.replaceAll(/=150/gi, '=350'));
          }
        }}
      />
    </CoverArtWrapper>
  );
};

export default CachedCoverArt;
