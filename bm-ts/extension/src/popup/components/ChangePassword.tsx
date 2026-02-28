import { FormEvent, useState } from 'react';
import Spinner from './Spinner';
import { getErrorMessage, logError, validatePassword } from '../../utils/errors';

interface ChangePasswordProps {
  onCancel: () => void;
  onSuccess: () => void;
}

export default function ChangePassword({ onCancel, onSuccess }: ChangePasswordProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      setIsSubmitting(false);
      return;
    }

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      setError(validation.errors.join('. '));
      setIsSubmitting(false);
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'auth.changePassword',
        payload: {
          currentPassword,
          newPassword,
        },
      });
      setMessage('Password changed successfully!');
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'ChangePassword:handleSubmit');
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-3">Change Password</h2>

      {error && <div className="error mb-3">{error}</div>}
      {message && <div className="success mb-3">{message}</div>}

      <form onSubmit={handleSubmit}>
        <div className="mb-3">
          <label htmlFor="currentPassword" className="block text-sm font-medium mb-1">
            Current Password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="input-field"
          />
        </div>

        <div className="mb-3">
          <label htmlFor="newPassword" className="block text-sm font-medium mb-1">
            New Password
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="input-field"
          />
        </div>

        <div className="mb-3">
          <label htmlFor="confirmPassword" className="block text-sm font-medium mb-1">
            Confirm New Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="input-field"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting ? 'true' : 'false'}
          aria-disabled={isSubmitting ? 'true' : 'false'}
          className="btn mb-2 flex items-center justify-center gap-2"
        >
          {isSubmitting && <Spinner size="sm" />}
          {isSubmitting ? 'Changing...' : 'Change Password'}
        </button>

        <button type="button" onClick={onCancel} className="btn-secondary btn-block">
          Cancel
        </button>
      </form>
    </div>
  );
}
