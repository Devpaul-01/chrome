import { useState } from 'react';
import type { Contact } from '../../api/client';

// Re-export Contact type for convenience
export type { Contact };

type ContactListProps = {
  contacts: Contact[];
  onAddContact: () => void;
  onImportContacts: () => void;
  onEditContact: (contact: Contact) => void;
  onDeleteContact: (id: string) => void;
};

export default function ContactList({
  contacts,
  onAddContact,
  onImportContacts,
  onEditContact,
  onDeleteContact,
}: ContactListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredContacts = contacts.filter((contact) => {
    const name = contact.name.toLowerCase();
    const query = searchQuery.toLowerCase();
    return name.includes(query);
  });

  const formatBirthday = (isoDate: string) => {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', timeZone: 'UTC' });
    } catch {
      return isoDate;
    }
  };

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onImportContacts}
          className="btn-orange flex-1 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          Import Contacts
        </button>
        <button
          onClick={onAddContact}
          className="btn flex-1 flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add New Contact
        </button>
      </div>

      <h2 className="text-xl font-bold text-blueStrong">My Contacts</h2>

      {/* Search bar */}
      <div className="w-full min-w-0">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search contacts by name"
          className="w-full min-w-0 contact-search-input"
        />
      </div>

      {/* Contacts list */}
      {filteredContacts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {contacts.length === 0 ? 'No contacts added yet.' : 'No contacts match your search.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContacts.map((contact) => (
            <div
              key={contact.id}
              className="card p-3 flex justify-between items-start gap-3 hover:shadow-md transition-shadow"
            >
              <div className="flex-1 min-w-0 overflow-hidden">
                <h3 className="font-semibold text-sm text-textPrimary break-words">{contact.name}</h3>
                <div className="mt-1 space-y-0.5">
                  <p className="text-xs font-semibold text-orangeBrand">
                    🎂 {formatBirthday(contact.birthday)}
                  </p>
                  {contact.gender && (
                    <p className="text-xs text-textMuted">
                      <span className="font-medium">Gender:</span> {contact.gender}
                    </p>
                  )}
                  {contact.notes && (
                    <div className="text-xs text-textMuted break-words">
                      {contact.notes.split('|').map((line, i) => (
                        <p key={i}>{line.trim()}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onEditContact(contact)}
                  className="btn-sm-blue"
                  aria-label={`Edit ${contact.name}`}
                >
                  Edit
                </button>
                <button
                  onClick={() => onDeleteContact(contact.id)}
                  className="btn-sm-danger"
                  aria-label={`Delete ${contact.name}`}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
