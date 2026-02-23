import type { ViewMode } from '../context/AppContext';

interface ShortcutItem {
  label: string;
  description: string;
  icon: React.ReactNode;
  viewMode: ViewMode;
  color: 'orange' | 'blue';
}

interface MessagesHubProps {
  onNavigate: (view: ViewMode) => void;
}

const IconTemplates = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <line x1="9" y1="10" x2="15" y2="10" />
    <line x1="12" y1="7" x2="12" y2="13" />
  </svg>
);

const IconPosts = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const IconScheduling = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <circle cx="12" cy="16" r="1" fill="currentColor" />
  </svg>
);

const IconAnalytics = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="2" y1="20" x2="22" y2="20" />
  </svg>
);

const IconImages = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const SHORTCUTS: ShortcutItem[] = [
  {
    label: 'Message Templates',
    description: 'Create & edit templates',
    icon: <IconTemplates />,
    viewMode: 'message-templates',
    color: 'orange',
  },
  {
    label: 'Timeline Posts',
    description: 'Manage post templates',
    icon: <IconPosts />,
    viewMode: 'posts',
    color: 'blue',
  },
  {
    label: 'Scheduling',
    description: 'Set send schedules',
    icon: <IconScheduling />,
    viewMode: 'scheduling',
    color: 'blue',
  },
  {
    label: 'Analytics',
    description: 'View message stats',
    icon: <IconAnalytics />,
    viewMode: 'analytics',
    color: 'orange',
  },
  {
    label: 'Image Library',
    description: 'Browse & upload images',
    icon: <IconImages />,
    viewMode: 'images',
    color: 'blue',
  },
];

export default function MessagesHub({ onNavigate }: MessagesHubProps) {
  return (
    <div role="tabpanel" id="messages-panel" className="tab-content">
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-blue-strong)' }}>
        Messages
      </h2>
      <p className="muted mb-4">Choose a section to get started.</p>

      <div className="messages-hub-grid">
        {SHORTCUTS.map((item) => (
          <button
            key={item.viewMode}
            className={`messages-hub-card messages-hub-card--${item.color}`}
            onClick={() => onNavigate(item.viewMode)}
            aria-label={item.label}
          >
            <span className="messages-hub-icon">{item.icon}</span>
            <span className="messages-hub-label">{item.label}</span>
            <span className="messages-hub-desc">{item.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
