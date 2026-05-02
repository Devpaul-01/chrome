import { useState, useEffect } from 'react';
import AutomationSettings from './AutomationSettings';
import Spinner from './Spinner';
import HelpTooltip from './HelpTooltip';

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

interface SchedulingSettingsProps {
  timezone: string;
  onUpdateTimezone: (timezone: string) => Promise<void>;
  isSubmitting: boolean;
}

export default function SchedulingSettings({
  timezone,
  onUpdateTimezone,
  isSubmitting,
}: SchedulingSettingsProps) {
  const [localTimezone, setLocalTimezone] = useState(timezone);

  // Sync local state when the persisted timezone prop changes (e.g. after a
  // successful save propagates back through the user context).
  useEffect(() => {
    setLocalTimezone(timezone);
  }, [timezone]);

  return (
    <div className="space-y-4">
      <AutomationSettings onClose={() => {}} showClose={false} />

      {/* Timezone Settings */}
      <div className="card">
        <h3 className="text-md font-semibold mb-4">Timezone Settings</h3>
        <div className="space-y-3">
          <div>
            <label htmlFor="schedulingTimezone" className="block text-sm font-medium mb-1">
              Your Timezone{' '}
              <HelpTooltip label="All schedules use this timezone. Choose the timezone where you and most of your friends are located to ensure messages are sent at appropriate times." />
            </label>
            <select
              id="schedulingTimezone"
              value={localTimezone}
              onChange={(e) => setLocalTimezone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg focus:outline-none input-styled"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              This timezone is used for scheduling birthday messages
            </p>
          </div>
          <button
            onClick={() => void onUpdateTimezone(localTimezone)}
            className="btn btn-block flex items-center justify-center gap-2"
            disabled={isSubmitting}
          >
            {isSubmitting && <Spinner size="sm" />}
            <span>Update Timezone</span>
          </button>
        </div>
      </div>
    </div>
  );
}
