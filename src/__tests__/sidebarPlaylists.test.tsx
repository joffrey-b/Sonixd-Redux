jest.mock('../api/controller', () => ({
  apiController: jest.fn(),
}));

jest.mock('../hooks/usePlaylistsCache', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { configureStore } from '@reduxjs/toolkit';
import configReducer from '../redux/configSlice';
import connectivityReducer from '../redux/connectivitySlice';
import SidebarPlaylists from '../components/layout/SidebarPlaylists';
import { apiController } from '../api/controller';
import usePlaylistsCache from '../hooks/usePlaylistsCache';
import { Server } from '../types';

const mockApiController = apiController as jest.MockedFunction<typeof apiController>;
const mockUsePlaylistsCache = usePlaylistsCache as jest.MockedFunction<typeof usePlaylistsCache>;

function renderSidebar(effectiveOffline: boolean) {
  const store = configureStore({
    reducer: { config: configReducer, connectivity: connectivityReducer },
    preloadedState: {
      config: { ...configReducer(undefined, { type: '@@INIT' }), serverType: Server.Subsonic },
      connectivity: { pingConfirmedUnreachable: effectiveOffline, isManuallyForced: false },
    },
  });
  const queryClient = new QueryClient();
  render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SidebarPlaylists />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>
  );
}

// Audit follow-up: discovered while diagnosing an unrelated e2e failure that
// this sidebar's playlist query had no offline branch at all, unlike
// PlaylistList.tsx's already-established fallback -- the sidebar silently
// went empty while offline even though the main Playlists page correctly
// still showed the cached content.
describe('SidebarPlaylists offline fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders playlists from the live query when online', async () => {
    mockApiController.mockResolvedValue([{ id: 'p1', title: 'Imported Mix' }]);
    mockUsePlaylistsCache.mockReturnValue({
      syncPlaylists: jest.fn(),
      getCachedPlaylists: jest.fn().mockReturnValue([]),
      hasPlaylistsCacheForCurrentServer: jest.fn().mockReturnValue(false),
    });

    renderSidebar(false);

    expect(await screen.findByRole('button', { name: 'Imported Mix' })).toBeInTheDocument();
    expect(mockApiController).toHaveBeenCalled();
  });

  it('falls back to the cached playlists snapshot while offline instead of rendering nothing', async () => {
    mockApiController.mockResolvedValue([]);
    mockUsePlaylistsCache.mockReturnValue({
      syncPlaylists: jest.fn(),
      getCachedPlaylists: jest.fn().mockReturnValue([
        {
          id: 'p1',
          title: 'Imported Mix',
          comment: '',
          owner: 'admin',
          public: false,
          songCount: 3,
          duration: 100,
          created: '',
          changed: '',
          image: '',
          songIds: [],
        },
      ]),
      hasPlaylistsCacheForCurrentServer: jest.fn().mockReturnValue(true),
    });

    renderSidebar(true);

    expect(await screen.findByRole('button', { name: 'Imported Mix' })).toBeInTheDocument();
    expect(mockApiController).not.toHaveBeenCalled();
  });
});
