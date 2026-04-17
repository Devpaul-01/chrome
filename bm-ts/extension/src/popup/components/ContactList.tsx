import { useEffect, useState } from 'react';
import type { Contact } from '../../api/client';
import { sendBackgroundMessage } from '../api';
import type { MessageGroup } from './MessageGroups';

// Re-export Contact type for convenience
export type { Contact };

type ContactListProps = {
  contacts: Contact[];
  onAddContact?: () => void;
  onImportContacts?: () => void;
  onEditContact?: (contact: Contact) => void;
  onDeleteContact?: (id: string) => void;
  onClose?: () => void;
};

export default function ContactList({
  contacts,
  onAddContact,
  onImportContacts,
  onEditContact,
  onDeleteContact,
  onClose,
}: ContactListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [groups, setGroups] = useState<MessageGroup[]>([]);

  useEffect(() => {
    sendBackgroundMessage<MessageGroup[]>({ type: 'messageGroups.list' })
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]));

  const filteredContacts = contacts.filter((contact) => {
    const name = contact.name.toLowerCase();
    const query = searchQuery.toLowerCase();
    const matchesSearch = name.includes(query);
    const matchesGroup =
      !selectedGroupId ||
      (selectedGroupId === '__none__' ? !contact.group_id : contact.group_id === selectedGroupId);
    return matchesSearch && matchesGroup;
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
      {/* Action buttons — only shown when handlers are provided */}
      {(onImportContacts || onAddContact) && (
        <div className="flex gap-3">
          {onImportContacts && (
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
          )}
          {onAddContact && (
            <button
              onClick={onAddContact}
              className="btn flex-1 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Add New Contact
            </button>
          )}
        </div>
      )}

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

      {/* Group filter */}
      {groups.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedGroupId('')}
            className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
              selectedGroupId === ''
                ? 'text-white border-transparent'
                : 'bg-transparent border-gray-300 text-gray-500'
            }`}
            style={selectedGroupId === '' ? { background: 'var(--color-blue-strong)' } : {}}
          >
            All
          </button>
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setSelectedGroupId(selectedGroupId === g.id ? '' : g.id)}
              className="text-xs px-2.5 py-1 rounded-full font-medium border transition-colors"
              style={{
                background: selectedGroupId === g.id ? g.color : 'transparent',
                borderColor: g.color,
                color: selectedGroupId === g.id ? '#fff' : g.color,
              }}
            >
              {g.name}
            </button>
          ))}
          <button
            onClick={() => setSelectedGroupId(selectedGroupId === '__none__' ? '' : '__none__')}
            className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-colors ${
              selectedGroupId === '__none__'
                ? 'text-white border-transparent bg-gray-400'
                : 'bg-transparent border-gray-300 text-gray-400'
            }`}
          >
            Ungrouped
          </button>
        </div>
      )}

      {/* Contacts list */}
      {filteredContacts.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {contacts.length === 0 ? 'No contacts added yet.' : 'No contacts match your search.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContacts.map((contact) => {
            const group = contact.group_id ? groupMap[contact.group_id] : null;
            return (
              <div
                key={contact.id}
                className="card p-3 flex justify-between items-start gap-3 transition-all"
                style={{
                  border: '1px solid var(--color-orange-brand)',
                  background: 'rgba(229,103,23,0.06)',
                }}
              >
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm text-textPrimary break-words">
                      {contact.name}
                    </h3>
                    {group ? (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: group.color + '22',
                          color: group.color,
                          border: `1px solid ${group.color}`,
                        }}
                      >
                        {group.name}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-400 border border-gray-200">
                        Ungrouped
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-xs font-semibold text-orangeBrand">
                      🎂 {formatBirthday(contact.birthday)}
                    </p>
                    {contact.birthday_month_only && (
                      <p className="text-xs font-semibold text-blue-500">
                        ⏳ Month only — messaging paused until exact date is set
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {onEditContact && (
                    <button
                      onClick={() => onEditContact(contact)}
                      className="btn-sm-blue"
                      aria-label={`Edit ${contact.name}`}
                    >
                      Edit
                    </button>
                  )}
                  {onDeleteContact && (
                    <button
                      onClick={() => onDeleteContact(contact.id)}
                      className="btn-sm-danger"
                      aria-label={`Delete ${contact.name}`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onClose && (
        <button className="btn mt-4" onClick={onClose}>
          ← Back to Home
        </button>
      )}
    </div>
  );
}
