import { useState } from 'react';
import { requestEmailVerification } from '../../api/client';

type Props = {
  email: string;
};

export default function ResendVerificationEmailButton({ email }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const handleResend = async () => {
    setStatus('loading');
    setMessage(null);
    try {
      // Use the same baseUrl logic as other API calls (assume /api for now)
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
      const res = await requestEmailVerification(baseUrl, { email });
      setStatus('success');
      setMessage(res.message || 'Verification email sent. Please check your inbox.');
    } catch (err: unknown) {
      const error = err as { status?: number } | undefined;
      setStatus('error');
      if (error?.status === 429) {
        setMessage('You are sending requests too quickly. Please wait and try again.');
      } else {
        setMessage('Failed to resend verification email. Please try again later.');
      }
    }
  };

  return (
    <div className="mb-3">
      <button
        type="button"
        className="btn-secondary w-full mb-1"
        onClick={handleResend}
        disabled={status === 'loading'}
        aria-busy={status === 'loading'}
      >
        {status === 'loading' ? 'Resending...' : 'Resend Verification Email'}
      </button>
      {message && (
        <div
          className={`text-xs mt-1 ${status === 'success' ? 'text-green-700' : 'text-red-600'}`}
          role="alert"
          aria-live="polite"
        >
          {message}
        </div>
      )}
    </div>
  );
}
