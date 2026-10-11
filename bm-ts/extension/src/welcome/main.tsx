import * as Sentry from '@sentry/browser';
import ReactDOM from 'react-dom/client';
import App from './App';
// Reuse the popup's stylesheet directly so the welcome tab matches the
// popup's existing white/orange theme exactly, instead of duplicating it.
import '../popup/popup.css';
import './welcome.css';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);
