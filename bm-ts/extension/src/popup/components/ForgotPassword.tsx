import { FormEvent, useState } from 'react';
import Spinner from './Spinner';
import { getErrorMessage, logError, validateEmail } from '../../utils/errors';
import { sendExtensionMessage } from '../../utils/bridge';

interface ForgotPasswordProps {
  onBack: () => void;
  onRequestSent: () => void;
}

export default function ForgotPassword({ onBack, onRequestSent }: ForgotPasswordProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);
    // Add your async logic here, e.g. API call
    if (!validateEmail(email)) {
      setError('Please enter a valid email address.');
      setIsSubmitting(false);
      return;
    }
    try {
      // Simulate API call
      await sendExtensionMessage<{ message: string }>({
        type: 'auth.requestPasswordReset',
        payload: { email },
      });

      setMessage('Reset E-mail sent. Please check your E-mail.');
      setTimeout(() => {
        onRequestSent();
      }, 3000);
    } catch (err) {
      logError(err);
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="card" role="form" aria-labelledby="forgot-password-title">
      <h2 id="forgot-password-title" className="text-lg font-semibold mb-3">
        Forgot Password
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Enter your email address and we&apos;ll send you a link to reset your password.
      </p>

      {error && (
        <div className="error mb-3" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      {message && (
        <div className="success mb-3" role="status" aria-live="polite">
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} aria-describedby="forgot-password-title">
        <div className="mb-3">
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="input-field"
            aria-required="true"
            aria-label="Email address"
            autoComplete="email"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary btn-block mb-2 flex items-center justify-center gap-2"
          aria-label={isSubmitting ? 'Sending password reset link' : 'Send password reset link'}
        >
          {isSubmitting && <Spinner size="sm" />}
          {isSubmitting ? 'Sending...' : 'Send Reset Link'}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="btn-secondary btn-block"
          aria-label="Back to Login"
        >
          Back to Login
        </button>
      </form>
    </div>
  );
}
