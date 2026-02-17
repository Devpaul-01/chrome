import { FormEvent, useState } from 'react';
import Spinner from './Spinner';
import { getErrorMessage, logError, validateEmail } from '../../utils/errors';

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

    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      setError(emailValidation.error || 'Invalid email');
      setIsSubmitting(false);
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'auth.requestPasswordReset',
        payload: { email },
      });
      setMessage('Password reset link sent! Check your email.');
      setTimeout(() => {
        onRequestSent();
      }, 2000);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'ForgotPassword:handleSubmit');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-3">Forgot Password</h2>
      <p className="text-sm text-gray-600 mb-4">
        Enter your email address and we'll send you a link to reset your password.
      </p>

      {error && <div className="error mb-3">{error}</div>}
      {message && <div className="success mb-3">{message}</div>}

      <form onSubmit={handleSubmit}>
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
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary btn-block mb-2 flex items-center justify-center gap-2"
        >
          {isSubmitting && <Spinner size="sm" />}
          {isSubmitting ? 'Sending...' : 'Send Reset Link'}
        </button>

        <button type="button" onClick={onBack} className="btn-secondary btn-block">
          Back to Login
        </button>
      </form>
    </div>
  );
}
