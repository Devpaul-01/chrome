import { FormEvent, useEffect, useState } from 'react';
import type { Contact } from './ContactList';
import { sendBackgroundMessage } from '../api';
import type { MessageGroup } from './MessageGroups';

type ContactFormProps = {
  contact?: Contact; // If editing existing contact
  onSubmit: (contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  message: string | null;
};

export default function ContactForm({
  contact,
  onSubmit,
  onCancel,
  isSubmitting,
  message,
}: ContactFormProps) {
  const loosedContact = contact as unknown as Record<string, unknown>;
  const [firstName, setFirstName] = useState(() => {
    if (typeof loosedContact?.firstName === 'string') return loosedContact.firstName;
    if (contact?.name) return contact.name.split(' ')[0] ?? '';
    return '';
  });
  const [lastName, setLastName] = useState(() => {
    if (typeof loosedContact?.lastName === 'string') return loosedContact.lastName;
    if (contact?.name) return contact.name.split(' ').slice(1).join(' ') ?? '';
    return '';
  });
  const [facebookProfileUrl, setFacebookProfileUrl] = useState(
    (typeof loosedContact?.facebook_profile_url === 'string' &&
      loosedContact.facebook_profile_url) ||
      (typeof loosedContact?.facebookProfileUrl === 'string' && loosedContact.facebookProfileUrl) ||
      '',
  );
  const [birthday, setBirthday] = useState(contact?.birthday ? contact.birthday.slice(0, 10) : '');
  const [groupId, setGroupId] = useState<string>(contact?.group_id ?? '');
  const [groups, setGroups] = useState<MessageGroup[]>([]);

  useEffect(() => {
    sendBackgroundMessage<MessageGroup[]>({ type: 'messageGroups.list' })
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Build payload matching backend ContactCreate schema
    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    const fb =
      facebookProfileUrl && facebookProfileUrl.trim()
        ? facebookProfileUrl.trim()
        : name
        ? `https://facebook.com/${name.replace(/\s+/g, '.').toLowerCase()}`
        : '';

    const payload: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      facebook_profile_url: fb,
      birthday: new Date(birthday).toISOString(),
      group_id: groupId || null,
    };

    await onSubmit(payload);
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-2 text-blueStrong">
        {contact ? 'Edit Contact' : 'Add New Contact'}
      </h2>
      <p className="text-sm text-gray-600 mb-4">Fields marked * are required.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* First Name */}
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium mb-1">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Enter first name"
            required
            className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
          />
          <p className="text-xs text-gray-500 mt-1">Enter the contact&apos;s given name.</p>
        </div>

        {/* Last Name */}
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium mb-1">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Enter last name"
            required
            className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
          />
          <p className="text-xs text-gray-500 mt-1">Enter the contact&apos;s family name.</p>
        </div>

        {/* Birthday */}
        <div>
          <label htmlFor="birthday" className="block text-sm font-medium mb-1">
            Birthday <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            id="birthday"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
          />
        </div>

        {/* Group */}
        <div>
          <label htmlFor="groupId" className="block text-sm font-medium mb-1">
            Group Label
          </label>
          <select
            id="groupId"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
          >
            <option value="">— No group —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Assign this contact to a group for filtering and targeted messaging.
          </p>
        </div>

        {/* Phone — commented out until multi-platform support is added */}
        {/* <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-1">
            Phone <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Enter phone number"
            required
            className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
          />
        </div> */}

        {/* Email — commented out until multi-platform support is added */}
        {/* <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter contact's email address"
            required
            className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
          />
        </div> */}

        {/* Message */}
        {message && <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{message}</div>}

        {/* Facebook profile URL (backend requires this) */}
        <div>
          <label htmlFor="facebookProfileUrl" className="block text-sm font-medium mb-1">
            Facebook Profile URL <span className="text-red-500">*</span>
          </label>
          <input
            type="url"
            id="facebookProfileUrl"
            value={facebookProfileUrl}
            onChange={(e) => setFacebookProfileUrl(e.target.value)}
            placeholder="https://facebook.com/username"
            required
            className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
          />
          <p className="text-xs text-gray-500 mt-1">
            Provide a public Facebook profile URL for this contact.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="btn-outline-orange"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn-orange" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Contact'}
          </button>
        </div>
      </form>
    </div>
  );
}
