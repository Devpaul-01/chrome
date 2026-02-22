import ScheduleSettings from './ScheduleSettings';
import AutomationSettings from './AutomationSettings';

interface SchedulingSettingsProps {
  onClose: () => void;
}

export default function SchedulingSettings({ onClose }: SchedulingSettingsProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <ScheduleSettings onClose={() => {}} showClose={false} />
        </div>
        <div>
          <AutomationSettings onClose={() => {}} showClose={false} />
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={onClose} className="btn-secondary">
          Close
        </button>
      </div>
    </div>
  );
}
