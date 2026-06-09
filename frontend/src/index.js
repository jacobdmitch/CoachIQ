import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initSentry } from './services/sentry';
import './styles/global.css';
import { LOCAL_MODE, bootstrapLocal } from './local/bootstrap';

// Init Sentry before the React tree mounts so any bootstrap errors are
// captured. Noop when REACT_APP_SENTRY_DSN is unset.
initSentry();

const root = ReactDOM.createRoot(document.getElementById('root'));
const renderApp = () =>
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );

if (LOCAL_MODE) {
  // Standalone mode: seed + local session must be ready before the auth check runs.
  bootstrapLocal().finally(renderApp);
} else {
  renderApp();
}
