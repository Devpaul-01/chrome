import { FormEvent, useState } from 'react';
import Spinner from './Spinner';

export type UserProfile = {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  timezone?: string;
};

type AccountManagementProps = {
  user: UserProfile;
  onUpdateProfile: (profile: Partial<UserProfile>) => Promise<void>;
  onUpdateTimezone: (timezone: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onLogout: () => void;
  isSubmitting: boolean;
  message: string | null;
};

export default function AccountManagement({
  user,
  onUpdateProfile,
  onUpdateTimezone,
  onDeleteAccount,
  onLogout,
  isSubmitting,
  message,
}: AccountManagementProps) {
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');
  const [timezone, setTimezone] = useState(
    user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onUpdateProfile({
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      email: email.trim(),
      phone: phone.trim() || undefined,
    });
  };

  const handleTimezoneUpdate = async () => {
    await onUpdateTimezone(timezone);
  };

  const handleDeleteConfirm = async () => {
    await onDeleteAccount();
  };

  // Get common timezones for dropdown
  const commonTimezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Dubai',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-blueStrong">Account Management</h2>

      {/* Account Information */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Account Information</h3>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          {/* First Name */}
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium mb-1">
              First Name
            </label>
            <input
              type="text"
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First Name"
              className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
            />
          </div>

          {/* Last Name */}
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium mb-1">
              Last Name
            </label>
            <input
              type="text"
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last Name"
              className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-1">
              Phone
            </label>
            <input
              type="tel"
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 234 567 8900"
              className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn w-full flex items-center justify-center gap-2"
            disabled={isSubmitting}
            aria-busy={isSubmitting ? 'true' : 'false'}
            aria-disabled={isSubmitting ? 'true' : 'false'}
          >
            {isSubmitting && <Spinner size="sm" />}
            <span>{isSubmitting ? 'Updating...' : 'Update Profile'}</span>
          </button>
        </form>
      </div>

      {/* Timezone Settings */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Timezone Settings</h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium mb-1">
              Your Timezone
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
            >
              {commonTimezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              This timezone is used for scheduling birthday messages
            </p>
          </div>
          <button
            onClick={handleTimezoneUpdate}
            className="btn w-full flex items-center justify-center gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting && <Spinner size="sm" />}
            <span>Update Time Zone</span>
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`p-3 rounded text-sm ${
            message.toLowerCase().includes('success')
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message}
        </div>
      )}

      {/* Logout */}
      <div className="card">
        <button onClick={onLogout} className="btn w-full">
          Logout
        </button>
      </div>

      {/* Delete Account */}
      <div className="card">
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="btn-danger w-full flex items-center justify-center gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting && <Spinner size="sm" />}
            <span>Delete Account</span>
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-700 font-medium">
              Are you sure you want to delete your account? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="btn-danger flex-1 flex items-center justify-center gap-2"
                disabled={isSubmitting}
              >
                {isSubmitting && <Spinner size="sm" />}
                <span>{isSubmitting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
