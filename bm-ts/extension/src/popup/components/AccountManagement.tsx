import { FormEvent, useEffect, useState } from 'react';
import Spinner from './Spinner';
import HelpTooltip from './HelpTooltip';

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
  isSubmitting: boolean;
  message: string | null;
};

export default function AccountManagement({
  user,
  onUpdateProfile,
  isSubmitting,
  message,
}: AccountManagementProps) {
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');

  useEffect(() => {
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setEmail(user.email);
    setPhone(user.phone || '');
  }, [user]);

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onUpdateProfile({
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    });
  };

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
              First Name{' '}
              <HelpTooltip label="Your first name is used in the welcome greeting on the Home tab." />
            </label>
            <input
              type="text"
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First Name"
              className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
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
              className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email{' '}
              <HelpTooltip label="Your account email is used for login and password reset. Changing it here updates your account email." />
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-1">
              Phone{' '}
              <HelpTooltip label="Optional. Use international format, e.g. +1 234 567 8900." />
            </label>
            <input
              type="tel"
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 234 567 8900"
              className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn w-full flex items-center justify-center gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting && <Spinner size="sm" />}
            <span>{isSubmitting ? 'Updating...' : 'Update Profile'}</span>
          </button>
        </form>
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
    </div>
  );
}
