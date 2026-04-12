import { FormEvent, useEffect, useState } from 'react';
import Spinner from './Spinner';
import { getErrorMessage, logError } from '../../utils/errors';
import { sendBackgroundMessage } from '../api';
import HelpTooltip from './HelpTooltip';
import FeatureTip from './FeatureTip';

export interface BirthdaySchedule {
  id: string;
  days_before: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

type TimingMode = 'before' | 'on' | 'after';

interface ScheduleSettingsProps {
  onClose: () => void;
  showClose?: boolean;
}

export default function ScheduleSettings({ onClose, showClose = true }: ScheduleSettingsProps) {
  const [schedules, setSchedules] = useState<BirthdaySchedule[]>([]);
  const [timingMode, setTimingMode] = useState<TimingMode>('on');
  const [daysInput, setDaysInput] = useState('1');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSchedules();
  }, []);

  async function loadSchedules() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await sendBackgroundMessage<BirthdaySchedule[]>({
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

  function computeDaysBefore(): number {
    if (timingMode === 'on') return 0;
    const days = parseInt(daysInput, 10);
    if (isNaN(days) || days < 1) return NaN;
    return timingMode === 'before' ? days : -days;
  }

  async function handleAddSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    const daysBefore = computeDaysBefore();
    if (isNaN(daysBefore)) {
      setError('Please enter a valid number of days (1 or more)');
      setIsSubmitting(false);
      return;
    }

    if (schedules.some((s) => s.days_before === daysBefore)) {
      setError('A schedule for this timing already exists');
      setIsSubmitting(false);
      return;
    }

    try {
      await sendBackgroundMessage({
        type: 'schedules.create',
        payload: { days_before: daysBefore, enabled: true },
      });
      setMessage('Schedule added!');
      setTimingMode('on');
      setDaysInput('1');
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
      await sendBackgroundMessage({
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
      await sendBackgroundMessage({
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
      <h2 className="text-lg font-semibold mb-3">
        Birthday Message Schedule{' '}
        <HelpTooltip label="Schedules control when messages are sent relative to each friend's birthday. You can create multiple schedules — e.g. one for the day itself and another for a follow-up the day after." />
      </h2>
      <p className="text-sm text-gray-600 mb-3">
        Choose when to send birthday messages relative to the actual birthday.
      </p>

      <FeatureTip
        tipId="schedule_setup"
        message="Create at least one schedule to tell the extension when to send messages. Most users start with 'On the birthday' and add more later."
      />

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
            <label className="block text-sm font-medium mb-2">
              Send message{' '}
              <HelpTooltip label="'Days before' sends the message early. 'On the birthday' sends on the actual day. 'Days after' sends a follow-up, e.g. 'Hope you had a great birthday!'" />
            </label>
            <div className="flex gap-2 items-center mb-3">
              <select
                value={timingMode}
                onChange={(e) => setTimingMode(e.target.value as TimingMode)}
                className="input-field"
                aria-label="Timing relative to birthday"
              >
                <option value="before">Days before</option>
                <option value="on">On the birthday</option>
                <option value="after">Days after</option>
              </select>
              {timingMode !== 'on' && (
                <input
                  type="number"
                  min={1}
                  value={daysInput}
                  onChange={(e) => setDaysInput(e.target.value)}
                  className="input-field w-20"
                  required
                  aria-label="Number of days"
                />
              )}
            </div>
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
            <h3 className="text-sm font-semibold mb-2">Your Schedules</h3>
            {schedules.length === 0 ? (
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
