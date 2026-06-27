import React, { useEffect } from 'react';
import { ipcRenderer, shell } from '../components/shared/bridge';
import axios from 'axios';
import { Notification, toaster } from 'rsuite';

const REPO = 'joffrey-b/Sonixd-Redux';
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

function isNewer(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const [c1, c2, c3] = parse(current);
  const [l1, l2, l3] = parse(latest);
  if (l1 !== c1) return l1 > c1;
  if (l2 !== c2) return l2 > c2;
  return l3 > c3;
}

const useCheckForUpdates = () => {
  useEffect(() => {
    if (process.env.NODE_ENV === 'test') return;

    const check = async () => {
      try {
        const currentVersion: string = await ipcRenderer.invoke('app-version');
        const { data } = await axios.get(API_URL);
        const latestTag: string = data.tag_name;

        if (isNewer(currentVersion, latestTag)) {
          toaster.push(
            <Notification type="info" header={`Sonixd Redux ${latestTag} is available`} closable>
              <div>
                <p style={{ margin: '4px 0 8px' }}>You are running v{currentVersion}.</p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => shell.openExternal(RELEASES_URL)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontSize: 'inherit',
                    }}
                  >
                    View release on GitHub →
                  </button>
                  <button
                    type="button"
                    onClick={() => toaster.clear()}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      opacity: 0.6,
                      cursor: 'pointer',
                      fontSize: 'inherit',
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </Notification>,
            { placement: 'topEnd', duration: 0 }
          );
        }
      } catch {
        // Silent fail — no network, no releases yet, API rate limit, etc.
      }
    };

    check();
  }, []);
};

export default useCheckForUpdates;
