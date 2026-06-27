import React, { useRef, useState } from 'react';
import md5 from 'md5';
import randomstring from 'randomstring';
import { Form, Message, RadioGroup } from 'rsuite';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { settings, setDefaultSettings } from '../shared/bridge';
import { reloadPage } from '../../shared/navigation';
import { clearCredentialCache } from '../../api/api';
import { clearCredentialCache as clearJellyfinCredentialCache } from '../../api/jellyfinApi';
import {
  StyledButton,
  StyledCheckbox,
  StyledInput,
  StyledInputPickerContainer,
  StyledRadio,
} from '../shared/styled';
import { LoginPanel } from './styled';
import GenericPage from '../layout/GenericPage';
import logo from '../../../assets/icon.png';
import { mockSettings } from '../../shared/mockSettings';
import packageJson from '../../package.json';
import { Server } from '../../types';

const Login = () => {
  const { t } = useTranslation();
  const [serverType, setServerType] = useState('subsonic');
  const [serverName, setServerName] = useState('');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [legacyAuth, setLegacyAuth] = useState(false);
  const [acceptSelfSigned, setAcceptSelfSigned] = useState(
    typeof window.bridge !== 'undefined' && Boolean(settings.get('acceptSelfSigned'))
  );
  const [message, setMessage] = useState('');
  const serverTypePickerRef = useRef(null);

  const handleConnect = async () => {
    setMessage('');

    if (typeof window.bridge === 'undefined') {
      setMessage(
        t('login.bridgeError', 'Application bridge not available. Please reinstall the app.')
      );
      return;
    }

    const cleanServerName = serverName.replace(/\/$/, '');
    const salt = randomstring.generate({ length: 16, charset: 'alphanumeric' });
    const hash = md5(password + salt);

    try {
      const testConnection = legacyAuth
        ? await axios.get(
            `${cleanServerName}/rest/ping.view?v=1.13.0&c=sonixd-redux&f=json&u=${encodeURIComponent(
              userName
            )}&p=${encodeURIComponent(password)}`
          )
        : await axios.get(
            `${cleanServerName}/rest/ping.view?v=1.13.0&c=sonixd-redux&f=json&u=${encodeURIComponent(userName)}&s=${salt}&t=${hash}`
          );

      // Since a valid request will return a 200 response, we need to check that there
      // are no additional failures reported by the server
      if (testConnection.data['subsonic-response'].status === 'failed') {
        setMessage(`${testConnection.data['subsonic-response'].error.message}`);
        return;
      }
    } catch (err) {
      if (err instanceof Error) {
        setMessage(`${err.message}`);
        return;
      }
      setMessage(t('An unknown error occurred'));
      return;
    }

    try {
      const success = await settings.setCredentials({
        server: cleanServerName,
        serverBase64: btoa(cleanServerName),
        serverType: 'subsonic',
        username: userName,
        hash,
        salt,
        legacyAuth,
        ...(legacyAuth ? { password } : {}),
      });
      if (!success) {
        setMessage(t('login.credentialSaveError', 'Failed to save credentials. Please try again.'));
        return;
      }

      // Set defaults on login
      setDefaultSettings(false);
      clearCredentialCache();
      reloadPage();
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : t('login.unknownError', 'An unexpected error occurred.')
      );
    }
  };

  const handleConnectJellyfin = async () => {
    setMessage('');

    if (typeof window.bridge === 'undefined') {
      setMessage(
        t('login.bridgeError', 'Application bridge not available. Please reinstall the app.')
      );
      return;
    }

    const cleanServerName = serverName.replace(/\/$/, '');
    const deviceId = randomstring.generate({ length: 12, charset: 'alphanumeric' });

    try {
      const { data } = await axios.post(
        `${cleanServerName}/users/authenticatebyname`,
        {
          Username: userName,
          Pw: password,
        },
        {
          headers: {
            'X-Emby-Authorization': `MediaBrowser Client="Sonixd Redux", Device="PC", DeviceId="${deviceId}", Version="${packageJson.version}"`,
          },
        }
      );

      try {
        const success = await settings.setCredentials({
          server: cleanServerName,
          serverBase64: btoa(cleanServerName),
          serverType: 'jellyfin',
          username: data.User.Id,
          token: data.AccessToken,
          deviceId,
        });
        if (!success) {
          setMessage(
            t('login.credentialSaveError', 'Failed to save credentials. Please try again.')
          );
          return;
        }

        // Set defaults on login
        setDefaultSettings(false);
        clearJellyfinCredentialCache();
        reloadPage();
      } catch (err) {
        setMessage(
          err instanceof Error
            ? err.message
            : t('login.unknownError', 'An unexpected error occurred.')
        );
      }
    } catch (err) {
      if (err instanceof Error) {
        setMessage(`${err.message}`);
        return;
      }
      setMessage(t('An unknown error occurred'));
    }
  };

  return (
    <GenericPage hideDivider>
      <LoginPanel bordered>
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ margin: 0 }}>Sonixd Redux</h1>
            <p style={{ margin: '4px 0 0', opacity: 0.6 }}>{t('Sign in to your server')}</p>
          </div>
          <img src={logo} height="80px" width="80px" alt="" />
        </span>
        {message !== '' && (
          <Message type="error" data-testid="login-error" style={{ marginTop: '12px' }}>
            {message}
          </Message>
        )}
        <Form id="login-form" fluid style={{ paddingTop: '8px' }}>
          <Form.Group>
            <Form.ControlLabel>{t('Server type')}</Form.ControlLabel>
            <StyledInputPickerContainer ref={serverTypePickerRef}>
              <RadioGroup inline value={serverType} onChange={(e) => setServerType(e as Server)}>
                <StyledRadio value="subsonic">Subsonic</StyledRadio>
                <StyledRadio value="jellyfin" data-testid="server-type-jellyfin">
                  Jellyfin
                </StyledRadio>
              </RadioGroup>
            </StyledInputPickerContainer>
          </Form.Group>
          <Form.Group>
            <Form.ControlLabel>{t('Server')}</Form.ControlLabel>
            <StyledInput
              id="login-servername"
              data-testid="server-url-input"
              name="servername"
              value={serverName}
              onChange={(e: string) => setServerName(e)}
              placeholder={t('Requires http(s)://')}
            />
          </Form.Group>
          <Form.Group>
            <Form.ControlLabel>{t('Username')}</Form.ControlLabel>
            <StyledInput
              id="login-username"
              data-testid="username-input"
              name="name"
              value={userName}
              onChange={(e: string) => setUserName(e)}
              placeholder={t('Enter username')}
            />
          </Form.Group>
          <Form.Group>
            <Form.ControlLabel>{t('Password')}</Form.ControlLabel>
            <StyledInput
              id="login-password"
              data-testid="password-input"
              name="password"
              type="password"
              value={password}
              onChange={(e: string) => setPassword(e)}
              placeholder={t('Enter password')}
            />
          </Form.Group>
          {serverType !== 'jellyfin' && (
            <StyledCheckbox
              defaultChecked={
                process.env.NODE_ENV === 'test'
                  ? mockSettings.legacyAuth
                  : typeof window.bridge !== 'undefined' && Boolean(settings.get('legacyAuth'))
              }
              checked={legacyAuth}
              onChange={(_v: unknown, e: boolean) => {
                settings.set('legacyAuth', e);
                setLegacyAuth(e);
              }}
            >
              {t('Legacy auth (plaintext)')}
            </StyledCheckbox>
          )}
          <StyledCheckbox
            data-testid="accept-self-signed-toggle"
            checked={acceptSelfSigned}
            onChange={(_v: unknown, e: boolean) => {
              settings.set('acceptSelfSigned', e);
              setAcceptSelfSigned(e);
            }}
          >
            {t('Accept self-signed certificates')}
          </StyledCheckbox>
          {acceptSelfSigned && (
            <Message type="warning" data-testid="self-signed-warning">
              {t(
                'Security risk: self-signed certificates lack any type of external validation, so as long as a certificate is configured on the server, any connection will work. Only enable this if you are certain you signed the certificate that the server is using.'
              )}
            </Message>
          )}
          <StyledButton
            id="login-button"
            data-testid="connect-button"
            appearance="primary"
            type="submit"
            block
            onClick={serverType !== 'jellyfin' ? handleConnect : handleConnectJellyfin}
          >
            {t('Connect')}
          </StyledButton>
        </Form>
      </LoginPanel>
    </GenericPage>
  );
};

export default Login;
