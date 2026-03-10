import { useCallback, useEffect, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import { getErrorMessage, logError } from '../../utils/errors';
import { useAppContext } from '../context/AppContext';
import type { Contact } from '../components/ContactList';

// Normalises various contact shapes (frontend form or legacy) to the canonical
// API payload.  Pass `opts.id` when building an update payload.
function normalizeContactFields(
  contact: Record<string, unknown>,
  opts?: { id?: string },
): Record<string, unknown> {
  const c = contact;

  // Already in canonical backend shape for a create — pass through unchanged
  if (!opts?.id && 'name' in c && 'facebook_profile_url' in c) {
    return c;
  }

  const name = (
    (c.name as string | undefined) ??
    `${(c.firstName as string) || ''} ${(c.lastName as string) || ''}`.trim()
  );

  let facebook_profile_url: string | undefined =
    (c.facebook_profile_url as string | undefined) ??
    (c.facebookProfileUrl as string | undefined) ??
    (c.facebook as string | undefined) ??
    undefined;
  if (!facebook_profile_url && !opts?.id && name) {
    facebook_profile_url = `https://facebook.com/${name.replace(/\s+/g, '.').toLowerCase()}`;
  }

  let birthday: string | undefined = c.birthday as string | undefined;
  try {
    const d = new Date(c.birthday as string);
    if (!isNaN(d.getTime())) birthday = d.toISOString();
  } catch { /* keep raw value */ }

  const notesParts: string[] = [];
  if (c.relationship) notesParts.push(`relationship: ${c.relationship}`);
  if (c.phone) notesParts.push(`phone: ${c.phone}`);
  if (c.email) notesParts.push(`email: ${c.email}`);

  const mapped: Record<string, unknown> = opts?.id ? { id: opts.id } : {};
  if (name) mapped.name = name;
  if (facebook_profile_url) mapped.facebook_profile_url = facebook_profile_url;
  if (birthday) mapped.birthday = birthday;
  // Prefer c.notes if already packed by the form; otherwise build from individual fields
  if (c.notes !== undefined) {
    if (c.notes) mapped.notes = c.notes;
  } else if (notesParts.length) {
    mapped.notes = notesParts.join(' | ');
  }
  if (c.gender) {
    const g = String(c.gender).toUpperCase();
    mapped.gender = g === 'MALE' || g === 'FEMALE' || g === 'NEUTRAL' ? g : undefined;
  }

  return mapped;
}

export function useContacts() {
  const { user, showToast, setViewMode } = useAppContext();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    try {
      const data = await sendBackgroundMessage<Contact[]>({ type: 'contacts.list' });
      setContacts(Array.isArray(data) ? data : []);
    } catch (error) {
      logError(error, 'loadContacts');
      setContacts([]);
    }
  }, []);

  useEffect(() => {
    if (!user) { setContacts([]); return; }
    void loadContacts();
  }, [user, loadContacts]);

  const handleAddContact = useCallback(
    async (contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> => {
      setIsSubmitting(true);
      setMessage(null);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = normalizeContactFields(contact as Record<string, unknown>) as any;
        const newContact = await sendBackgroundMessage<Contact>({
          type: 'contacts.create',
          payload,
        });
        setContacts((prev) => [newContact, ...prev]);
        setViewMode('contacts');
        showToast('Contact added successfully!', 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleAddContact');
        setMessage(msg);
        showToast(msg, 'error');
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [showToast, setViewMode],
  );

  const handleUpdateContact = useCallback(
    async (
      contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<void> => {
      if (!editingContact) return;
      setIsSubmitting(true);
      setMessage(null);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped = normalizeContactFields(contact as Record<string, unknown>, {
          id: editingContact.id,
        }) as any;
        const updated = await sendBackgroundMessage<Contact>({
          type: 'contacts.update',
          payload: mapped,
        });
        setContacts((prev) => prev.map((c) => (c.id === editingContact.id ? updated : c)));
        setEditingContact(null);
        setViewMode('contacts');
        showToast('Contact updated successfully!', 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleUpdateContact');
        setMessage(msg);
        showToast(msg, 'error');
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [editingContact, showToast, setViewMode],
  );

  const handleDeleteContact = useCallback(
    async (id: string): Promise<void> => {
      if (!confirm('Are you sure you want to delete this contact?')) return;
      const prev = contacts;
      setContacts((c) => c.filter((contact) => contact.id !== id));
      try {
        await sendBackgroundMessage<{ status: string }>({
          type: 'contacts.delete',
          payload: { id },
        });
        showToast('Contact deleted', 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleDeleteContact');
        showToast(msg, 'error');
        setContacts(prev);
      }
    },
    [contacts, showToast],
  );

  const handleImportContacts = useCallback(
    async (
      importedContacts: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>[],
    ): Promise<void> => {
      try {
        const newContacts = await sendBackgroundMessage<Contact[]>({
          type: 'contacts.bulkCreate',
          payload: importedContacts,
        });
        setContacts((prev) => [...newContacts, ...prev]);
        setShowImportModal(false);
        showToast(`Successfully imported ${newContacts.length} contacts!`, 'success');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleImportContacts');
        showToast(msg, 'error');
        throw error;
      }
    },
    [showToast],
  );

  return {
    contacts,
    editingContact,
    setEditingContact,
    showImportModal,
    setShowImportModal,
    isSubmitting,
    message,
    loadContacts,
    handleAddContact,
    handleUpdateContact,
    handleDeleteContact,
    handleImportContacts,
  };
}
