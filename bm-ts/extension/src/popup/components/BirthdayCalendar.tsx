import React, { useState } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import type { Contact } from '../../api/client';

interface BirthdayCalendarProps {
  contacts: Contact[];
  onBack: () => void;
}

function getBirthdayDates(contacts: Contact[]) {
  return contacts
    .filter((c) => c.birthday)
    .map((c) => {
      const d = new Date(c.birthday);
      // Ignore year, only month and day
      return `${d.getMonth()}-${d.getDate()}`;
    });
}

function getContactsForDate(contacts: Contact[], date: Date) {
  return contacts.filter((c) => {
    if (!c.birthday) return false;
    const d = new Date(c.birthday);
    // Ignore year, only match month and day
    return d.getMonth() === date.getMonth() && d.getDate() === date.getDate();
  });
}

export default function BirthdayCalendar({ contacts, onBack }: BirthdayCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [view, setView] = useState<'calendar' | 'grid'>('calendar');
  const birthdayDates = getBirthdayDates(contacts);
  function tileClassName({ date, view }: { date: Date; view: string }) {
    if (view === 'month') {
      const key = `${date.getMonth()}-${date.getDate()}`;
      return birthdayDates.includes(key) ? 'birthday-highlight' : undefined;
    }
  }
  const contactsOnSelectedDate = selectedDate ? getContactsForDate(contacts, selectedDate) : [];
  const birthdaysByDate: { [key: string]: Contact[] } = {};
  contacts.forEach((contact) => {
    if (contact.birthday) {
      const date = new Date(contact.birthday);
      const key = `${date.getMonth()}-${date.getDate()}`;
      if (!birthdaysByDate[key]) birthdaysByDate[key] = [];
      birthdaysByDate[key].push(contact);
    }
  });

  return (
    <div className="birthday-calendar card">
      <h2 className="text-lg font-semibold mb-3">Birthday Calendar</h2>

      <div className="flex gap-2 mb-4">
        <button
          className={`btn-outline-orange ${view === 'calendar' ? 'font-bold' : ''}`}
          onClick={() => setView('calendar')}
        >
          Calendar View
        </button>
        <button
          className={`btn-outline-orange ${view === 'grid' ? 'font-bold' : ''}`}
          onClick={() => setView('grid')}
        >
          List View
        </button>
      </div>
      {view === 'calendar' ? (
        <>
          <Calendar onClickDay={setSelectedDate} tileClassName={tileClassName} />
          {selectedDate && (
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-2">
                Birthdays on {selectedDate.toLocaleDateString()}
              </h3>
              {contactsOnSelectedDate.length === 0 ? (
                <div className="text-textMuted">No birthdays on this day.</div>
              ) : (
                <ul className="space-y-2">
                  {contactsOnSelectedDate.map((contact) => (
                    <li key={contact.id} className="p-2 border rounded flex items-center gap-2">
                      <span className="font-semibold">{contact.name}</span>
                      <span className="text-xs text-orangeBrand">{contact.birthday}</span>
                      {contact.facebook_profile_url && (
                        <a
                          href={contact.facebook_profile_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto text-blueBrand underline text-xs"
                          aria-label={`View ${contact.name}'s Facebook profile`}
                        >
                          Facebook
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <style>{`.birthday-highlight { background: #ffe5b4 !important; border-radius: 50%; }`}</style>
        </>
      ) : (
        <div className="upcoming-birthday-list">
          <h3 className="text-lg font-semibold mb-2">Upcoming Birthdays</h3>
          {contacts.length === 0 ? (
            <div className="text-textMuted">No contacts found.</div>
          ) : (
            <ul className="space-y-2">
              {contacts
                .filter((c) => c.birthday)
                .sort((a, b) => {
                  const today = new Date();
                  const aDate = new Date(a.birthday);
                  const bDate = new Date(b.birthday);
                  // Sort by next upcoming birthday (ignoring year)
                  const aMonthDay = aDate.getMonth() * 100 + aDate.getDate();
                  const bMonthDay = bDate.getMonth() * 100 + bDate.getDate();
                  const todayMonthDay = today.getMonth() * 100 + today.getDate();
                  const aDiff = (aMonthDay - todayMonthDay + 1200) % 1200;
                  const bDiff = (bMonthDay - todayMonthDay + 1200) % 1200;
                  return aDiff - bDiff;
                })
                .slice(0, 10)
                .map((contact) => (
                  <li key={contact.id} className="p-2 border rounded flex items-center gap-2">
                    <span className="font-semibold">{contact.name}</span>
                    <span className="text-xs text-orangeBrand">
                      {new Date(contact.birthday).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'long',
                      })}
                    </span>
                    {contact.facebook_profile_url && (
                      <a
                        href={contact.facebook_profile_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-blueBrand underline text-xs"
                        aria-label={`View ${contact.name}'s Facebook profile`}
                      >
                        Facebook
                      </a>
                    )}
                  </li>
                ))}
            </ul>
          )}
          <button onClick={onBack} className="btn-secondary mb-4" aria-label="Back to Contacts">
            ← Back to Contacts
          </button>
        </div>
      )}
    </div>
  );
}
