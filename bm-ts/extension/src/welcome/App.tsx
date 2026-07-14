import { FormEvent, useState } from 'react';
import ErrorBoundary from '../popup/components/ErrorBoundary';
import AuthForm from '../popup/components/AuthForm';
import ForgotPassword from '../popup/components/ForgotPassword';
import ResendVerificationEmailButton from '../popup/components/ResendVerificationEmailButton';
import { sendBackgroundMessage } from '../popup/api';

type AuthMode = 'login' | 'register' | 'forgot-password' | 'verify-email-pending';

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      if (authMode === 'login') {
        // NOTE: message type 'auth.login' is inferred from the
        // 'auth.requestPasswordReset' pattern used elsewhere — confirm
        // against utils/messages.ts if this errors.
        await sendBackgroundMessage({
          type: 'auth.login',
          payload: { email, password },
        });
        setLoginSuccess(true);
      } else {
        await sendBackgroundMessage({
          type: 'auth.register',
          payload: { email, password },
        });
        setAuthMode('verify-email-pending');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      // Backend returns a 403 EMAIL_NOT_VERIFIED message on login for
      // unverified accounts — route those into the same pending-verification
      // screen used after registration instead of showing a raw error.
      if (msg.toLowerCase().includes('verify your email')) {
        setAuthMode('verify-email-pending');
      } else {
        setMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ErrorBoundary>
      <div className="welcome-shell">
        <div className="welcome-header">
          <img
            src="./images/new-logo/Birthday_messaging-logo.png"
            alt="BirthdayMessaging"
            className="welcome-logo"
          />
          <h1>Welcome to BirthdayMessaging</h1>
          <p>Sign in or create an account to get started.</p>
        </div>

        {loginSuccess ? (
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">You&apos;re logged in</h2>
            <p className="text-sm text-gray-600">
              You can close this tab now and click the BirthdayMessaging icon in your toolbar to
              get started.
            </p>
          </div>
        ) : authMode === 'verify-email-pending' ? (
          <div className="card">
            <h2 className="text-lg font-semibold mb-3">Check your email</h2>
            <p className="text-sm text-gray-600 mb-4">
              We sent a verification link to <strong>{email}</strong>. Verify your email, then
              come back here and log in.
            </p>
            <ResendVerificationEmailButton email={email} />
            <button
              type="button"
              className="btn-secondary btn-block"
              onClick={() => setAuthMode('login')}
            >
              Back to Login
            </button>
          </div>
        ) : authMode === 'forgot-password' ? (
          <ForgotPassword
            onBack={() => setAuthMode('login')}
            onRequestSent={() => setAuthMode('login')}
          />
        ) : (
          <AuthForm
            authMode={authMode}
            setAuthMode={setAuthMode}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            message={message}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}