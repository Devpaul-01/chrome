import { useEffect, useRef, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import Spinner from './Spinner';
import type { Contact } from '../../api/client';
import HelpTooltip from './HelpTooltip';
import type { MessageGroup } from './MessageGroups';

interface UpcomingBirthdaysProps {
  onClose: () => void;
}

function parseBirthdayLocal(birthday: string): Date {
  // Slice to YYYY-MM-DD first — the API returns full ISO datetime strings
  // (e.g. "2000-05-15T00:00:00+00:00") because the DB column is timezone-aware.
  // Splitting the full string on '-' would produce NaN for the day component.
  const [year, month, day] = birthday.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getDaysUntilBirthday(birthday: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const bday = parseBirthdayLocal(birthday);
  const thisYear = today.getFullYear();

  const nextBirthday = new Date(thisYear, bday.getMonth(), bday.getDate());
  if (nextBirthday < today) {
    nextBirthday.setFullYear(thisYear + 1);
  }

  const diffMs = nextBirthday.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export default function UpcomingBirthdays({ onClose }: UpcomingBirthdaysProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<MessageGroup[]>([]);
  // Generation counter: only the most recent loadContacts call may write state.
  // This prevents a slow in-flight fetch from overwriting a newer result.
  const loadGenRef = useRef(0);

  async function loadContacts() {
    const gen = ++loadGenRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const data = await sendBackgroundMessage<Contact[]>({ type: 'contacts.list' });
      if (gen !== loadGenRef.current) return; // stale — a newer call is in flight
      const withBirthdays = (data || [])
        .filter((c) => {
          if (!c.birthday || c.birthday_month_only) return false;
          const name = c.name?.trim() ?? '';
          if (name.length < 2) return false;
          // Reject garbled names left over from old scraping runs
          if (/profile\s*(picture|photo)/i.test(name)) return false;
          if (/'s\s+(profile|photo)\b/i.test(name)) return false;
          if (/\d/.test(name)) return false;
          if (/\b(message|send|follow|view|write|poke)\b/i.test(name)) return false;
          return true;
        })
        .sort((a, b) => getDaysUntilBirthday(a.birthday) - getDaysUntilBirthday(b.birthday));
      setContacts(withBirthdays);
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      setError((err as Error).message);
    } finally {
      if (gen === loadGenRef.current) setIsLoading(false);
    }
  }

  useEffect(() => {
    // Silently remove garbled contacts that survived from old scraping runs,
    // then load the now-clean list.  Errors are ignored so a network blip or
    // unauthenticated state never blocks the view from rendering.
    sendBackgroundMessage<{ deleted: number }>({ type: 'contacts.cleanup' })
      .catch(() => {})
      .finally(() => {
        void loadContacts();
      });
    sendBackgroundMessage<MessageGroup[]>({ type: 'messageGroups.list' })
      .then(setGroups)
      .catch(() => {});
  }, []);

  async function handleGroupChange(contactId: string, groupId: string | null) {
    try {
      await sendBackgroundMessage({
        type: 'contacts.update',
        payload: { id: contactId, group_id: groupId },
      });
      setContacts((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, group_id: groupId } : c)),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const upcoming = contacts.filter((c) => getDaysUntilBirthday(c.birthday) <= 30);

  return (
    <div className="view-container">
      <h2 className="text-lg font-bold text-blueStrong mb-3">
        Upcoming Birthdays{' '}
        <HelpTooltip label="Shows friends with birthdays in the next 30 days, based on contacts synced from Facebook. Contacts marked 'Month only' are excluded since their exact date isn't known." />
      </h2>
      <p className="text-xs text-gray-600 mb-4">Friends with birthdays in the next 30 days.</p>

      {error && (
        <div className="error mb-4" role="alert">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="md" message="Loading birthdays..." />
        </div>
      ) : upcoming.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-white/80 rounded-lg">
          No upcoming birthdays in the next 30 days.
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map((contact) => {
            const days = getDaysUntilBirthday(contact.birthday);
            const bday = parseBirthdayLocal(contact.birthday);
            const dateLabel = bday.toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'long',
            });

            return (
              <div key={contact.id} className="card flex items-center gap-3 py-3">
                <div className="text-2xl">🎂</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-textPrimary truncate">
                    {contact.name}
                  </div>
                  <div className="text-xs text-textMuted">{dateLabel}</div>
                </div>
                <div className="text-right shrink-0">
                  {days === 0 ? (
                    <span className="badge badge-primary text-xs font-bold">Today!</span>
                  ) : days === 1 ? (
                    <span className="badge badge-primary text-xs font-bold">Tomorrow</span>
                  ) : (
                    <span className="text-xs text-textMuted font-medium">
                      in {days} day{days !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {contact.facebook_profile_url && (
                  <a
                    href={contact.facebook_profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blueBrand text-xs hover:underline shrink-0"
                    aria-label={`View ${contact.name}'s Facebook profile`}
                  >
                    Profile
                  </a>
                )}
                {groups.length > 0 && (
                  <select
                    value={contact.group_id || ''}
                    onChange={(e) => handleGroupChange(contact.id, e.target.value || null)}
                    className="text-field text-xs py-1 px-2 shrink-0"
                    style={{ maxWidth: '100px' }}
                    aria-label={`Group for ${contact.name}`}
                  >
                    <option value="">No group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button className="btn mt-4" onClick={onClose}>
        ← Back to Home
      </button>
    </div>
  );
}
