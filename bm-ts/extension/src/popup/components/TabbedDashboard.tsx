import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import { GenderOption } from './GenderFilter';

export interface BirthdayConfig {
  id: string;
  mode: 'advance' | 'normal' | 'followup';
  days_offset: number; // -7 to -1 for advance, 0 for normal, 1 to 7 for followup
  message_group_id?: string;
  post_id?: string;
  gender_filter: GenderOption;
  archive_enabled: boolean;
  enabled: boolean;
}

interface TabbedDashboardProps {
  onClose: () => void;
}

export interface TabbedDashboardHandle {
  focus: () => void;
}

type TabType = 'advance' | 'normal' | 'followup';

const TabbedDashboard = forwardRef<TabbedDashboardHandle, TabbedDashboardProps>(
  ({ onClose }, ref) => {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const [activeTab, setActiveTab] = useState<TabType>('normal');
    const [configs, setConfigs] = useState<BirthdayConfig[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        headingRef.current?.focus();
      },
    }));

    useEffect(() => {
      loadConfigs();
      headingRef.current?.focus();
    }, []);

    async function loadConfigs() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await sendBackgroundMessage<BirthdayConfig[]>({
          type: 'dashboard.getConfigs',
        });
        setConfigs(data);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }

    async function toggleConfig(id: string, enabled: boolean) {
      try {
        await sendBackgroundMessage<void>({
          type: 'dashboard.toggleConfig',
          payload: { id, enabled },
        });
        await loadConfigs();
      } catch (err) {
        setError((err as Error).message);
      }
    }

    const tabConfigs = configs.filter((c) => c.mode === activeTab);

    const tabs: { key: TabType; label: string; description: string }[] = [
      {
        key: 'advance',
        label: 'Advance Wisher',
        description: 'Wish friends 1-7 days before their birthday',
      },
      {
        key: 'normal',
        label: 'Normal Birthday',
        description: 'Wish friends on their actual birthday',
      },
      {
        key: 'followup',
        label: 'Follow-up Wisher',
        description: 'Wish friends 1-7 days after their birthday',
      },
    ];

    return (
      <div className="view-container">
        <h2 ref={headingRef} tabIndex={-1} className="view-heading">
          Birthday Dashboard
        </h2>

        <p className="view-description">
          Configure when and how to send birthday wishes. Choose advance, normal, or follow-up
          modes.
        </p>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
            borderBottom: '2px solid #e0e0e0',
            paddingBottom: '8px',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={activeTab === tab.key ? 'button-primary' : 'button-secondary'}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '14px',
                textAlign: 'center',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Description */}
        <div className="card" style={{ marginBottom: '16px', background: '#f0f8ff' }}>
          <p style={{ margin: 0, fontSize: '14px' }}>
            <strong>{tabs.find((t) => t.key === activeTab)?.label}</strong>
            <br />
            {tabs.find((t) => t.key === activeTab)?.description}
          </p>
        </div>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {isLoading ? (
          <p>Loading configurations...</p>
        ) : (
          <div>
            {/* Tab Content */}
            {activeTab === 'advance' && <AdvanceTab configs={tabConfigs} onToggle={toggleConfig} />}
            {activeTab === 'normal' && <NormalTab configs={tabConfigs} onToggle={toggleConfig} />}
            {activeTab === 'followup' && (
              <FollowupTab configs={tabConfigs} onToggle={toggleConfig} />
            )}

            {tabConfigs.length === 0 && (
              <p className="empty-state">
                No configurations for this mode. Create one in settings.
              </p>
            )}
          </div>
        )}

        <button onClick={onClose} className="button-secondary" style={{ marginTop: '16px' }}>
          ← Back
        </button>
      </div>
    );
  },
);

// Advance Tab Component
function AdvanceTab({
  configs,
  onToggle,
}: {
  configs: BirthdayConfig[];
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <div>
      <div className="card" style={{ marginBottom: '16px', background: '#fff8dc' }}>
        <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Early Bird Wishes</h3>
        <p style={{ fontSize: '13px', margin: 0 }}>
          Send wishes 1-7 days before birthdays. Perfect for showing you care in advance!
        </p>
      </div>

      {configs.map((config) => (
        <ConfigCard key={config.id} config={config} onToggle={onToggle} />
      ))}
    </div>
  );
}

// Normal Tab Component
function NormalTab({
  configs,
  onToggle,
}: {
  configs: BirthdayConfig[];
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <div>
      <div className="card" style={{ marginBottom: '16px', background: '#ffe6f0' }}>
        <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>On The Day</h3>
        <p style={{ fontSize: '13px', margin: 0 }}>
          Send wishes exactly on their birthday. The classic way to celebrate!
        </p>
      </div>

      {configs.map((config) => (
        <ConfigCard key={config.id} config={config} onToggle={onToggle} />
      ))}
    </div>
  );
}

// Followup Tab Component
function FollowupTab({
  configs,
  onToggle,
}: {
  configs: BirthdayConfig[];
  onToggle: (id: string, enabled: boolean) => void;
}) {
  return (
    <div>
      <div className="card" style={{ marginBottom: '16px', background: '#e6f7ff' }}>
        <h3 style={{ fontSize: '15px', marginBottom: '8px' }}>Belated Wishes</h3>
        <p style={{ fontSize: '13px', margin: 0 }}>
          Send follow-up wishes 1-7 days after birthdays. Better late than never!
        </p>
      </div>

      {configs.map((config) => (
        <ConfigCard key={config.id} config={config} onToggle={onToggle} />
      ))}
    </div>
  );
}

// Config Card Component
function ConfigCard({
  config,
  onToggle,
}: {
  config: BirthdayConfig;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const getDaysLabel = (mode: string, offset: number) => {
    if (mode === 'normal') return 'On birthday';
    if (mode === 'advance')
      return `${Math.abs(offset)} day${Math.abs(offset) !== 1 ? 's' : ''} before`;
    if (mode === 'followup') return `${offset} day${offset !== 1 ? 's' : ''} after`;
    return `${offset} days`;
  };

  return (
    <div className="card" style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 'bold',
                color: config.enabled ? '#2ea44f' : '#999',
              }}
            >
              {getDaysLabel(config.mode, config.days_offset)}
            </span>
            <span
              style={{
                fontSize: '11px',
                background: '#f0f0f0',
                padding: '2px 6px',
                borderRadius: '3px',
              }}
            >
              {config.gender_filter === 'ALL'
                ? 'All'
                : config.gender_filter === 'MALE'
                ? 'Male'
                : config.gender_filter === 'FEMALE'
                ? 'Female'
                : 'Neutral'}
            </span>
          </div>

          <div style={{ fontSize: '12px', color: '#666' }}>
            {config.message_group_id && (
              <p style={{ margin: '2px 0' }}>
                Message Group: {config.message_group_id.slice(0, 8)}...
              </p>
            )}
            {config.post_id && (
              <p style={{ margin: '2px 0' }}>Post: {config.post_id.slice(0, 8)}...</p>
            )}
            {config.archive_enabled && (
              <p style={{ margin: '2px 0', color: '#2ea44f' }}>
                Archive mode enabled (no duplicates)
              </p>
            )}
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onToggle(config.id, e.target.checked)}
            style={{ width: '18px', height: '18px' }}
          />
          <span style={{ fontSize: '13px' }}>{config.enabled ? 'Active' : 'Disabled'}</span>
        </label>
      </div>
    </div>
  );
}

TabbedDashboard.displayName = 'TabbedDashboard';

export default TabbedDashboard;
