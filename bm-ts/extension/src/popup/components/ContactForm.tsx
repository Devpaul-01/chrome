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
  const [firstName, setFirstName] = useState(contact?.firstName || '');
  const [lastName, setLastName] = useState(contact?.lastName || '');
  const [relationship, setRelationship] = useState(contact?.relationship || '');
  const [birthday, setBirthday] = useState(contact?.birthday || '');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [email, setEmail] = useState(contact?.email || '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      relationship: relationship.trim() || undefined,
      birthday,
      phone: phone.trim() || undefined,
      email: email.trim(),
    });
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
        {message && (
          <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{message}</div>
        )}

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
