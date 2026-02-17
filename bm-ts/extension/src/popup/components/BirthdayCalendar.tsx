import { useState } from 'react';
import type { Contact } from './ContactList';

type BirthdayCalendarProps = {
  contacts: Contact[];
};

type CalendarView = 'calendar' | 'list';

type CalendarDate = {
  date: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  contacts: Contact[];
};

export default function BirthdayCalendar({ contacts }: BirthdayCalendarProps) {
  const [view, setView] = useState<CalendarView>('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const daysOfWeek = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  const getContactsForDate = (dateToCheck: Date): Contact[] => {
    return contacts.filter((contact) => {
      const birthday = new Date(contact.birthday);
      return (
        birthday.getDate() === dateToCheck.getDate() &&
        birthday.getMonth() === dateToCheck.getMonth()
      );
    });
  };

  const generateCalendarDates = (): CalendarDate[] => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Get the day of week (0 = Sunday, 1 = Monday, etc.)
    let startDayOfWeek = firstDay.getDay();
    // Convert Sunday (0) to 7 for Monday-start week
    startDayOfWeek = startDayOfWeek === 0 ? 7 : startDayOfWeek;

    const today = new Date();
    const dates: CalendarDate[] = [];

    // Add previous month's trailing days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 2; i >= 0; i--) {
      dates.push({
        date: prevMonthLastDay - i,
        isCurrentMonth: false,
        isToday: false,
        contacts: [],
      });
    }

    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const isToday =
        dateObj.getDate() === today.getDate() &&
        dateObj.getMonth() === today.getMonth() &&
        dateObj.getFullYear() === today.getFullYear();

      dates.push({
        date: day,
        isCurrentMonth: true,
        isToday,
        contacts: getContactsForDate(dateObj),
      });
    }

    // Add next month's leading days to fill the grid
    const remainingDays = 42 - dates.length; // 6 rows × 7 days = 42
    for (let day = 1; day <= remainingDays; day++) {
      dates.push({
        date: day,
        isCurrentMonth: false,
        isToday: false,
        contacts: [],
      });
    }

    return dates;
  };

  const getUpcomingBirthdays = (): { contact: Contact; daysUntil: number }[] => {
    const today = new Date();
    const thisYear = today.getFullYear();

    return contacts
      .map((contact) => {
        const birthday = new Date(contact.birthday);
        const thisYearBirthday = new Date(thisYear, birthday.getMonth(), birthday.getDate());

        // If birthday has passed this year, use next year's date
        if (thisYearBirthday < today) {
          thisYearBirthday.setFullYear(thisYear + 1);
        }

        const diffTime = thisYearBirthday.getTime() - today.getTime();
        const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return { contact, daysUntil };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  };

  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const calendarDates = generateCalendarDates();
  const upcomingBirthdays = getUpcomingBirthdays();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-blueStrong">Birthday Calendar</h2>

      {/* View Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView('calendar')}
          className={`flex-1 py-2 px-4 font-medium rounded-lg transition ${
            view === 'calendar'
              ? 'bg-blueStrong text-white shadow-md'
              : 'bg-white text-gray-700 hover:bg-gray-50 shadow-sm'
          }`}
        >
          Calendar View
        </button>
        <button
          onClick={() => setView('list')}
          className={`flex-1 py-2 px-4 font-medium rounded-lg transition ${
            view === 'list'
              ? 'bg-blueStrong text-white shadow-md'
              : 'bg-white text-gray-700 hover:bg-gray-50 shadow-sm'
          }`}
        >
          List View
        </button>
      </div>

      {view === 'calendar' ? (
        <div className="card p-4">
          {/* Month Navigation */}
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={previousMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white hover:bg-gray-100 text-gray-700 hover:text-gray-900 shadow-sm hover:shadow-md transition-all font-bold text-xl"
              aria-label="Previous month"
            >
              ‹
            </button>
            <h3 className="text-lg font-semibold">
              {monthNames[month]} {year}
            </h3>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-white hover:bg-gray-100 text-gray-700 hover:text-gray-900 shadow-sm hover:shadow-md transition-all font-bold text-xl"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Day headers */}
            {daysOfWeek.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-600 py-2">
                {day}
              </div>
            ))}

            {/* Calendar dates */}
            {calendarDates.map((calDate, index) => (
              <div
                key={index}
                className={`
                  aspect-square flex items-center justify-center text-sm rounded
                  ${!calDate.isCurrentMonth ? 'text-gray-300' : 'text-gray-900'}
                  ${calDate.isToday ? 'bg-yellow-300 font-bold' : ''}
                  ${calDate.contacts.length > 0 && calDate.isCurrentMonth ? 'bg-orange-50 font-semibold' : ''}
                  ${calDate.contacts.length > 0 && !calDate.isToday ? 'border-2 border-orangeBrand' : ''}
                `}
                title={
                  calDate.contacts.length > 0
                    ? calDate.contacts.map((c) => `${c.firstName} ${c.lastName}`).join(', ')
                    : undefined
                }
              >
                {calDate.date}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-4 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-yellow-300 rounded"></div>
              <span>Today</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 border-2 border-orangeBrand rounded"></div>
              <span>Birthday</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-4 space-y-2">
          <h3 className="font-semibold text-lg mb-3">Upcoming Birthdays</h3>
          {upcomingBirthdays.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No birthdays to display</p>
          ) : (
            upcomingBirthdays.slice(0, 20).map(({ contact, daysUntil }) => (
              <div
                key={contact.id}
                className="flex justify-between items-center p-3 border border-gray-200 rounded hover:bg-gray-50"
              >
                <div>
                  <p className="font-semibold">
                    {contact.firstName} {contact.lastName}
                  </p>
                  <p className="text-sm text-gray-600">
                    {new Date(contact.birthday).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-orangeBrand">
                    {daysUntil === 0 ? 'Today!' : `In ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
