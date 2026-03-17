import ScheduleSettings from './ScheduleSettings';
import AutomationSettings from './AutomationSettings';

export default function SchedulingSettings() {
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

    </div>
  );
}
