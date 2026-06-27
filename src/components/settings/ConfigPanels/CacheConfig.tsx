import React, { useState, useEffect } from 'react';
import { Message, ButtonToolbar, Whisper } from 'rsuite';
import CheckIcon from '@rsuite/icons/legacy/Check';
import CloseIcon from '@rsuite/icons/legacy/Close';
import ExternalLinkIcon from '@rsuite/icons/legacy/ExternalLink';
import { useTranslation } from 'react-i18next';
import { ConfigOptionDescription, ConfigPanel } from '../styled';
import {
  StyledInput,
  StyledCheckbox,
  StyledInputGroup,
  StyledInputNumber,
  StyledLink,
  StyledTag,
  StyledButton,
  StyledInputGroupButton,
} from '../../shared/styled';
import { getSongCachePath, getImageCachePath, getRootCachePath } from '../../../shared/utils';
import { notifyToast } from '../../shared/toast';
import { setMiscSetting } from '../../../redux/miscSlice';
import { useAppDispatch } from '../../../redux/hooks';
import Popup from '../../shared/Popup';
import { settings, shell, cache, cacheDir } from '../../shared/bridge';

const CacheConfig = ({ bordered }: { bordered?: boolean }) => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [imgCacheSize, setImgCacheSize] = useState(0);
  const [songCacheSize, setSongCacheSize] = useState(0);
  const [isEditingCachePath, setIsEditingCachePath] = useState(false);
  const [newCachePath, setNewCachePath] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [cacheSongs, setCacheSongs] = useState(Boolean(settings.get('cacheSongs')));
  const [cacheImages, setCacheImages] = useState(Boolean(settings.get('cacheImages')));
  const [cacheSizeLimitMb, setCacheSizeLimitMb] = useState(
    Math.round(Number(settings.get('songCacheSizeLimit')) / 1000 / 1000) || 5000
  );
  const [imageCacheSizeLimitMb, setImageCacheSizeLimitMb] = useState(
    Math.round(Number(settings.get('imageCacheSizeLimit')) / 1000 / 1000) || 2000
  );

  useEffect(() => {
    if (!settings.get('serverBase64')) return;
    cacheDir.ensure(getSongCachePath());
    cacheDir.ensure(getImageCachePath());
    cacheDir
      .getSize(getImageCachePath())
      .then((size) => setImgCacheSize(Number((size / 1000 / 1000).toFixed(0))))
      .catch(() => {});
    cacheDir
      .getSize(getSongCachePath())
      .then((size) => setSongCacheSize(Number((size / 1000 / 1000).toFixed(0))))
      .catch(() => {});
  }, []);

  const handleClearSongCache = async () => {
    const songCachePath = getSongCachePath();
    try {
      const files = await cacheDir.list(songCachePath);
      const matching = files.filter((file) =>
        /\.(mp3|flac|ogg|aac|m4a|wav|opus|wma|ape|alac)$/i.test(file)
      );
      await cacheDir.removeFiles(songCachePath, matching);
      setSongCacheSize(0);
      notifyToast('success', t('Cleared song cache'));
    } catch (err) {
      notifyToast('error', t('Unable to clear cache: {{err}}', { err }));
    }
  };

  const handleClearImageCache = async (type: 'playlist' | 'album' | 'artist' | 'folder') => {
    const imageCachePath = getImageCachePath();
    try {
      const files = await cacheDir.list(imageCachePath);
      // Match both normal cached files (e.g. album_123.jpg) and any stale TEMP files
      // left by interrupted downloads (e.g. TEMP_album_123.jpg)
      const matching = files.filter(
        (file) =>
          (file.split('_')[0] === type ||
            (file.split('_')[0] === 'TEMP' && file.split('_')[1] === type)) &&
          file.endsWith('.jpg')
      );
      await cacheDir.removeFiles(imageCachePath, matching);
      cacheDir
        .getSize(imageCachePath)
        .then((size) => setImgCacheSize(Number((size / 1000 / 1000).toFixed(0))))
        .catch(() => {});
      notifyToast('success', t('Cleared {{type}} image cache', { type }));
    } catch (err) {
      notifyToast('error', t('Unable to clear cache: {{err}}', { err }));
    }
  };

  return (
    <ConfigPanel bordered={bordered} header={t('Cache')}>
      {errorMessage !== '' && (
        <>
          <Message showIcon type="error">
            {errorMessage}
          </Message>
          <br />
        </>
      )}
      <ConfigOptionDescription>
        {t(
          'Songs are cached only when playback for the track fully completes and ends. Skipping to the next or previous track after only partially completing the track will not begin the caching process.'
        )}
      </ConfigOptionDescription>
      <br />
      {isEditingCachePath && (
        <>
          <StyledInputGroup>
            <StyledInput value={newCachePath} onChange={(e: string) => setNewCachePath(e)} />
            <StyledInputGroupButton
              onClick={async () => {
                const check = await cache.exists(newCachePath);
                if (check) {
                  settings.set('cachePath', newCachePath);
                  cacheDir.ensure(getSongCachePath());
                  cacheDir.ensure(getImageCachePath());
                  dispatch(
                    setMiscSetting({ setting: 'imageCachePath', value: getImageCachePath() })
                  );
                  dispatch(setMiscSetting({ setting: 'songCachePath', value: getSongCachePath() }));
                  setErrorMessage('');
                  return setIsEditingCachePath(false);
                }

                return setErrorMessage(
                  t('Path: {{newCachePath}} not found. Enter a valid path.', {
                    newCachePath,
                  })
                );
              }}
            >
              <CheckIcon />
            </StyledInputGroupButton>
            <StyledInputGroupButton
              onClick={() => {
                setIsEditingCachePath(false);
                setErrorMessage('');
              }}
            >
              <CloseIcon />
            </StyledInputGroupButton>
            <StyledInputGroupButton
              onClick={() => {
                const defaultPath = settings.getDefaultCachePath();
                settings.set('cachePath', defaultPath);
                dispatch(setMiscSetting({ setting: 'imageCachePath', value: getImageCachePath() }));
                dispatch(setMiscSetting({ setting: 'songCachePath', value: getSongCachePath() }));
                setErrorMessage('');
                return setIsEditingCachePath(false);
              }}
            >
              {t('Reset to default')}
            </StyledInputGroupButton>
          </StyledInputGroup>
          <p style={{ fontSize: 'smaller' }}>
            {t('*You will need to manually move any existing cached files to their new location.')}
          </p>
        </>
      )}
      {!isEditingCachePath && (
        <>
          {t('Location:')}{' '}
          <div style={{ overflow: 'hidden' }}>
            <StyledLink onClick={() => shell.openPath(getRootCachePath())}>
              {getRootCachePath()} <ExternalLinkIcon />
            </StyledLink>
          </div>
        </>
      )}
      <div style={{ width: '300px', marginTop: '20px' }}>
        <StyledCheckbox
          data-testid="song-cache-enable"
          checked={cacheSongs}
          onChange={(_v: unknown, e: boolean) => {
            settings.set('cacheSongs', e);
            setCacheSongs(e);
          }}
        >
          {t('Songs')} <StyledTag>{songCacheSize} MB</StyledTag>
        </StyledCheckbox>
        <StyledCheckbox
          checked={cacheImages}
          onChange={(_v: unknown, e: boolean) => {
            settings.set('cacheImages', e);
            setCacheImages(e);
          }}
        >
          {t('Images')} <StyledTag>{imgCacheSize} MB</StyledTag>
        </StyledCheckbox>
      </div>
      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '120px' }}>{t('Songs limit')}</span>
          <StyledInputNumber
            defaultValue={String(cacheSizeLimitMb)}
            step={100}
            min={100}
            max={10000}
            width={125}
            onChange={(e: number | string) => {
              const mb = Number(e);
              if (!Number.isNaN(mb) && mb >= 100 && mb <= 10000) {
                settings.set('songCacheSizeLimit', mb * 1000 * 1000);
                setCacheSizeLimitMb(mb);
              }
            }}
          />
          <span>{t('MB')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ width: '120px' }}>{t('Images limit')}</span>
          <StyledInputNumber
            defaultValue={String(imageCacheSizeLimitMb)}
            step={100}
            min={100}
            max={10000}
            width={125}
            onChange={(e: number | string) => {
              const mb = Number(e);
              if (!Number.isNaN(mb) && mb >= 100 && mb <= 10000) {
                settings.set('imageCacheSizeLimit', mb * 1000 * 1000);
                setImageCacheSizeLimitMb(mb);
              }
            }}
          />
          <span>{t('MB')}</span>
        </div>
      </div>
      <br />
      <ButtonToolbar>
        <StyledButton onClick={() => setIsEditingCachePath(true)}>
          {t('Edit cache location')}
        </StyledButton>
        <Whisper
          trigger="click"
          placement="autoVertical"
          speaker={
            <Popup>
              {t('Which cache would you like to clear?')}
              <ButtonToolbar>
                <StyledButton size="sm" onClick={handleClearSongCache}>
                  {t('Songs')}
                </StyledButton>
                <StyledButton size="sm" onClick={() => handleClearImageCache('playlist')}>
                  {t('Playlist images')}
                </StyledButton>
                <StyledButton size="sm" onClick={() => handleClearImageCache('album')}>
                  {t('Album images')}
                </StyledButton>
                <StyledButton size="sm" onClick={() => handleClearImageCache('artist')}>
                  {t('Artist images')}
                </StyledButton>
                <StyledButton size="sm" onClick={() => handleClearImageCache('folder')}>
                  {t('Folder images')}
                </StyledButton>
              </ButtonToolbar>
            </Popup>
          }
        >
          <StyledButton>{t('Clear cache')}</StyledButton>
        </Whisper>
      </ButtonToolbar>
    </ConfigPanel>
  );
};

export default CacheConfig;
