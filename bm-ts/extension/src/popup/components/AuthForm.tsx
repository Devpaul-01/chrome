import { FormEvent, useEffect, useRef, useState } from 'react';
import Spinner from './Spinner';
import { generateId } from '../../utils/accessibility';

type Props = {
  authMode: 'login' | 'register' | 'forgot-password' | 'verify-email-pending';
  setAuthMode: (m: 'login' | 'register' | 'forgot-password' | 'verify-email-pending') => void;
  email: string;
  setEmail: (s: string) => void;
  password: string;
  setPassword: (s: string) => void;
  isSubmitting: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  message: string | null;
};

export default function AuthForm({
  authMode,
  setAuthMode,
  email,
  setEmail,
  password,
  setPassword,
  isSubmitting,
  onSubmit,
  message,
}: Props) {
  const emailRef = useRef<HTMLInputElement | null>(null);
  const [emailErrorId] = useState(() => generateId('email-error'));
  const [passwordErrorId] = useState(() => generateId('password-error'));

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Email validation
  const emailValid = email.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const emailTouched = email.length > 0;

  // Password validation
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordHasNumber = /\d/.test(password);
  const passwordHasLetter = /[a-zA-Z]/.test(password);
  const passwordValid = password.length >= 8;
  const passwordTouched = password.length > 0;

  // Form validity
  const formValid = emailValid && passwordValid && email.length > 0;

  return (
    <form onSubmit={onSubmit} aria-label="Authentication form" className="card">
      <div className="flex mb-6 auth-toggle" role="group" aria-label="Authentication mode">
        <button
          type="button"
          onClick={() => setAuthMode('login')}
          className={`flex-1 mr-1 bg-orangeStrong text-white uppercase rounded-lg hover:bg-orangeBrand transition px-6 py-3 auth-btn ${
            authMode === 'login' ? 'active' : ''
          }`}
          aria-pressed={authMode === 'login' ? 'true' : 'false'}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setAuthMode('register')}
          className={`flex-1 ml-1 bg-orangeStrong text-white uppercase rounded-lg hover:bg-orangeBrand transition px-6 py-3 auth-btn ${
            authMode === 'register' ? 'active' : ''
          }`}
          aria-pressed={authMode === 'register' ? 'true' : 'false'}
        >
          Register
        </button>
      </div>

      <div className="h-4" />

      <label className="block mb-5">
        <span className="text-sm font-medium text-textPrimary">Email</span>
        <input
          ref={emailRef}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          aria-required="true"
          aria-invalid={emailTouched && !emailValid ? 'true' : 'false'}
          aria-describedby={emailTouched && !emailValid ? emailErrorId : undefined}
          placeholder="Enter your email"
          className={`w-full p-1.5 mt-0.5 rounded input-styled ${
            emailTouched && !emailValid ? '!border-red-500' : ''
          }`}
        />
        {emailTouched && !emailValid && (
          <p id={emailErrorId} className="text-xs text-red-600 mt-1" role="alert">
            Please enter a valid email address
          </p>
        )}
      </label>

      <label className="block mb-5">
        <span className="text-sm font-medium text-textPrimary">Password</span>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          required
          aria-required="true"
          aria-invalid={passwordTouched && !passwordValid ? 'true' : 'false'}
          aria-describedby={
            authMode === 'register' && passwordTouched
              ? `${passwordErrorId} password-requirements`
              : passwordTooShort && authMode === 'login'
              ? passwordErrorId
              : undefined
          }
          placeholder="Enter your password (min 8 characters)"
          minLength={8}
          className={`w-full p-1.5 mt-0.5 rounded input-styled ${
            passwordTouched && !passwordValid ? '!border-red-500' : ''
          }`}
        />
      </label>

      {authMode === 'register' && passwordTouched && (
        <div
          id="password-requirements"
          className="mb-5 text-xs space-y-1"
          role="status"
          aria-live="polite"
        >
          <div className={passwordValid ? 'text-green-600' : 'text-textMuted'}>
            <span aria-hidden="true">{passwordValid ? 'Yes' : 'No'}</span>
            <span className="ml-1">At least 8 characters</span>
          </div>
          <div className={passwordHasLetter ? 'text-green-600' : 'text-textMuted'}>
            <span aria-hidden="true">{passwordHasLetter ? 'Yes' : 'No'}</span>
            <span className="ml-1">Contains letters</span>
          </div>
          <div className={passwordHasNumber ? 'text-green-600' : 'text-textMuted'}>
            <span aria-hidden="true">{passwordHasNumber ? 'Yes' : 'No'}</span>
            <span className="ml-1">Contains numbers (recommended)</span>
          </div>
        </div>
      )}

      {passwordTooShort && authMode === 'login' && (
        <p id={passwordErrorId} className="text-sm text-red-600 mb-5" role="alert">
          Password must be at least 8 characters.
        </p>
      )}

      {message && (
        <div
          className="bg-red-100 text-[#611a15] p-3 rounded mb-5"
          role="alert"
          aria-live="assertive"
        >
          {message}
        </div>
      )}

      <div className="h-4" />

      <button
        type="submit"
        disabled={isSubmitting || !formValid}
        className="btn flex items-center justify-center gap-2"
        aria-busy={isSubmitting ? 'true' : 'false'}
        aria-disabled={isSubmitting || !formValid ? 'true' : 'false'}
        title={!formValid ? 'Please fix form errors before submitting' : ''}
      >
        {isSubmitting && <Spinner size="sm" />}
        <span>{isSubmitting ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Register'}</span>
      </button>

      {authMode === 'login' && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setAuthMode('forgot-password')}
            className="text-sm text-blueStrong hover:text-orangeStrong underline"
          >
            Forgot password?
          </button>
        </div>
      )}
    </form>
  );
}
