import * as Sentry from '@sentry/browser';
import ReactDOM from 'react-dom/client';
import App from './App';
import './popup.css';

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
