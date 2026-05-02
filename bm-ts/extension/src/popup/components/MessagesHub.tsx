import type { ViewMode } from '../context/AppContext';
import HelpTooltip from './HelpTooltip';
import FeatureTip from './FeatureTip';

interface ShortcutItem {
  label: string;
  description: string;
  icon: React.ReactNode;
  viewMode: ViewMode;
  color: 'orange' | 'blue' | 'green';
}

interface MessagesHubProps {
  onNavigate: (view: ViewMode) => void;
}

const IconTemplates = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    <line x1="9" y1="10" x2="15" y2="10" />
    <line x1="12" y1="7" x2="12" y2="13" />
  </svg>
);

const IconPosts = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const IconImages = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const IconGroups = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
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
    label: 'Image Library',
    description: 'Browse & upload images',
    icon: <IconImages />,
    viewMode: 'images',
    color: 'blue',
  },
  {
    label: 'Groups',
    description: 'Organise by tag',
    icon: <IconGroups />,
    viewMode: 'message-groups',
    color: 'green',
  },
];

export default function MessagesHub({ onNavigate }: MessagesHubProps) {
  return (
    <div role="tabpanel" id="messages-panel" className="tab-content">
      <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--color-blue-strong)' }}>
        Create templates and posts{' '}
        <HelpTooltip label="Message Templates are sent as private direct messages on Facebook. Timeline Posts are written directly on friends' walls. Use the Image Library to store images for the [Image] keyword. Tip: it's helpful to first create Groups and upload Images before creating Templates and Posts." />
      </h2>
      <p className="muted mb-4">Create and manage your birthday message content.</p>

      <FeatureTip
        tipId="messages_templates"
        message="Create your first message template to start sending personalised birthday wishes. You can also create timeline posts and upload images."
      />

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
