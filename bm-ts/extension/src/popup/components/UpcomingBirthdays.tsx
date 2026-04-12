import { useEffect, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import Spinner from './Spinner';
import type { Contact } from '../../api/client';
import HelpTooltip from './HelpTooltip';

interface UpcomingBirthdaysProps {
  onClose: () => void;
}

function getDaysUntilBirthday(birthday: string): number {
  const today = new Date();
  const bday = new Date(birthday);
  const thisYear = today.getFullYear();

  const nextBirthday = new Date(thisYear, bday.getMonth(), bday.getDate());
  if (nextBirthday < today) {
    nextBirthday.setFullYear(thisYear + 1);
  }

  const diffMs = nextBirthday.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export default function UpcomingBirthdays({ onClose }: UpcomingBirthdaysProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await sendBackgroundMessage<Contact[]>({ type: 'contacts.list' });
        const withBirthdays = (data || [])
          .filter((c) => c.birthday && !c.birthday_month_only)
          .sort((a, b) => getDaysUntilBirthday(a.birthday) - getDaysUntilBirthday(b.birthday));
        setContacts(withBirthdays);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

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
            const bday = new Date(contact.birthday);
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
