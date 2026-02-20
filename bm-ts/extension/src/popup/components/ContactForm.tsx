import { FormEvent, useState } from 'react';
import type { Contact } from './ContactList';

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
  const [firstName, setFirstName] = useState(() => {
    if ((contact as any)?.firstName) return (contact as any).firstName;
    if (contact?.name) return contact.name.split(' ')[0] ?? '';
    return '';
  });
  const [lastName, setLastName] = useState(() => {
    if ((contact as any)?.lastName) return (contact as any).lastName;
    if (contact?.name) return contact.name.split(' ').slice(1).join(' ') ?? '';
    return '';
  });
  const [facebookProfileUrl, setFacebookProfileUrl] = useState(
    (contact as any)?.facebook_profile_url || (contact as any)?.facebookProfileUrl || '',
  );
  // Parse notes for relationship, phone, email
  let parsedRelationship = '';
  let parsedPhone = '';
  let parsedEmail = '';
  if (contact?.notes) {
    const parts = contact.notes.split(' | ');
    for (const part of parts) {
      if (part.startsWith('relationship: '))
        parsedRelationship = part.replace('relationship: ', '').trim();
      if (part.startsWith('phone: ')) parsedPhone = part.replace('phone: ', '').trim();
      if (part.startsWith('email: ')) parsedEmail = part.replace('email: ', '').trim();
    }
  }
  const [relationship, setRelationship] = useState(parsedRelationship);
  const [birthday, setBirthday] = useState(contact?.birthday || '');
  const [phone, setPhone] = useState(parsedPhone);
  const [email, setEmail] = useState(parsedEmail);

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

    const payload: any = {
      name,
      facebook_profile_url: fb,
      birthday: new Date(birthday).toISOString(),
    };

    // Combine optional fields into notes if present
    const notesParts: string[] = [];
    if (relationship.trim()) notesParts.push(`relationship: ${relationship.trim()}`);
    if (phone.trim()) notesParts.push(`phone: ${phone.trim()}`);
    if (email.trim()) notesParts.push(`email: ${email.trim()}`);
    if (notesParts.length) payload.notes = notesParts.join(' | ');

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
            className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
          />
          <p className="text-xs text-gray-500 mt-1">Enter the contact's given name.</p>
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
            className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
          />
          <p className="text-xs text-gray-500 mt-1">Enter the contact's family name.</p>
        </div>

        {/* Relationship */}
        <div>
          <label htmlFor="relationship" className="block text-sm font-medium mb-1">
            Relationship
          </label>
          <input
            type="text"
            id="relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="Friend, Family, etc."
            className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
          />
          <p className="text-xs text-gray-500 mt-1">Describe how you know this contact.</p>
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
            className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
          />
        </div>

        {/* Phone */}
        <div>
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
            className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
          />
        </div>

        {/* Email */}
        <div>
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
            className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
          />
        </div>

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
            className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
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
