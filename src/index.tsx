import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { HelmetProvider } from 'react-helmet-async';
import { store } from './redux/store';
import './i18n/i18n';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');
const root = createRoot(rootEl);
// StrictMode intentionally removed: rsuite-table 5.x uses isMounting refs that are
// permanently flipped by StrictMode's first effect invocation, causing its layout
// recalculation effects to fire on the second mount with stale/zero contentWidth —
// which sets scrollX to a positive value and shifts all table rows to the far right.
// Production builds are unaffected (React production mode never double-invokes effects).
root.render(
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </QueryClientProvider>
  </Provider>
);
