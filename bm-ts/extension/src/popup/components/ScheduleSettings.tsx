import { FormEvent, useEffect, useState } from 'react';
import Spinner from './Spinner';
import { getErrorMessage, logError } from '../../utils/errors';
import HelpTooltip from './HelpTooltip';

export interface BirthdaySchedule {
  id: string;
  days_before: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface ScheduleSettingsProps {
  onClose: () => void;
  showClose?: boolean;
}

export default function ScheduleSettings({ onClose, showClose = true }: ScheduleSettingsProps) {
  const [schedules, setSchedules] = useState<BirthdaySchedule[]>([]);
  const [daysBeforeInput, setDaysBeforeInput] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [utcTime, setUtcTime] = useState(() => new Date().toUTCString().replace(' GMT', ' UTC'));

  useEffect(() => {
    loadSchedules();
    const timer = setInterval(
      () => setUtcTime(new Date().toUTCString().replace(' GMT', ' UTC')),
      1000,
    );
    return () => clearInterval(timer);
  }, []);

  async function loadSchedules() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await chrome.runtime.sendMessage({
        type: 'schedules.list',
      });
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'ScheduleSettings:loadSchedules');
      setError(errorMessage);
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const daysBefore = parseInt(daysBeforeInput, 10);
    if (isNaN(daysBefore)) {
      setError('Please enter a valid number');
      setIsSubmitting(false);
      return;
    }

    // Check if this schedule already exists
    if (schedules.some((s) => s.days_before === daysBefore)) {
      setError('A schedule for this timing already exists');
      setIsSubmitting(false);
      return;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'schedules.create',
        payload: { days_before: daysBefore, enabled: true },
      });
      setMessage('Schedule added successfully!');
      setDaysBeforeInput('0');
      await loadSchedules();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleSchedule(id: string, enabled: boolean) {
    setError(null);
    try {
      await chrome.runtime.sendMessage({
        type: 'schedules.update',
        payload: { id, enabled },
      });
      setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteSchedule(id: string) {
    if (!confirm('Are you sure you want to delete this schedule?')) {
      return;
    }
    setError(null);
    try {
      await chrome.runtime.sendMessage({
        type: 'schedules.delete',
        payload: { id },
      });
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      setMessage('Schedule deleted');
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      logError(err, 'ScheduleSettings:handleDeleteSchedule');
      setError(errorMessage);
    }
  }

  function formatScheduleText(daysBefore: number): string {
    if (daysBefore === 0) return 'On the birthday';
    if (daysBefore < 0) return `${Math.abs(daysBefore)} day(s) after`;
    return `${daysBefore} day(s) before`;
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-3">Birthday Message Schedule</h2>
      <p className="text-sm text-gray-600 mb-3">
        Configure when to send birthday messages relative to the actual birthday date.
      </p>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-textMuted font-medium">Current UTC time:</span>
        <span className="utc-clock">{utcTime}</span>
      </div>

      {error && (
        <div className="error mb-3" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success mb-3" role="status">
          {message}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="md" message="Loading schedules..." />
        </div>
      ) : (
        <>
          {/* Add new schedule */}
          <form onSubmit={handleAddSchedule} className="mb-4">
            <label htmlFor="daysBefore" className="block text-sm font-medium mb-1">
              Send messages{' '}
              <HelpTooltip label="Positive numbers = days before birthday (e.g. 3 = 3 days before). 0 = on the birthday. Negative numbers = days after (e.g. -1 = 1 day after)." />
            </label>
            <div className="flex gap-2 items-center mb-2">
              <input
                id="daysBefore"
                type="number"
                value={daysBeforeInput}
                onChange={(e) => setDaysBeforeInput(e.target.value)}
                placeholder="0"
                className="input-field flex-1"
                required
              />
              <span className="text-sm">day(s) before birthday</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Use negative numbers for days after (e.g., -1 = 1 day after)
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting ? 'true' : 'false'}
              aria-disabled={isSubmitting ? 'true' : 'false'}
              className="btn-primary btn-block flex items-center justify-center gap-2"
            >
              {isSubmitting && <Spinner size="sm" />}
              {isSubmitting ? 'Adding...' : 'Add Schedule'}
            </button>
          </form>

          {/* List of schedules */}
          <div className="border-t pt-3">
            <h3 className="text-sm font-semibold mb-2">Active Schedules</h3>
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner size="md" />
              </div>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-gray-500">
                No schedules configured. Add one above to get started.
              </p>
            ) : (
              <ul className="space-y-2">
                {schedules
                  .sort((a, b) => b.days_before - a.days_before)
                  .map((schedule) => (
                    <li
                      key={schedule.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="checkbox"
                          checked={schedule.enabled}
                          onChange={(e) => handleToggleSchedule(schedule.id, e.target.checked)}
                          className="w-4 h-4"
                          aria-label={`Enable schedule ${formatScheduleText(schedule.days_before)}`}
                        />
                        <span className="text-sm font-medium">
                          {formatScheduleText(schedule.days_before)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteSchedule(schedule.id)}
                        className="text-red-600 hover:text-red-700 text-sm px-2"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </>
      )}

      {showClose && (
        <button onClick={onClose} className="btn-secondary btn-block mt-4">
          Close
        </button>
      )}
    </div>
  );
}
