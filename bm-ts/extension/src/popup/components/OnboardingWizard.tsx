/**
 * OnboardingWizard.tsx — First-run guided setup wizard.
 *
 * Shown the first time an authenticated user opens the popup.
 * Presents 5 short steps that orient the user to the key features.
 * Uses glass morphism overlay consistent with the app design system.
 */

import { useEffect, useRef, useState } from 'react';

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface WizardStep {
  icon: string;
  title: string;
  content: string[];
  note?: string;
}

const STEPS: WizardStep[] = [
  {
    icon: '🎉',
    title: 'Welcome to Birthday Messaging!',
    content: [
      'This extension automatically sends personalised birthday messages to your Facebook friends.',
      "Let's walk you through the key features so you can get started in minutes.",
    ],
  },
  {
    icon: '✉️',
    title: 'Create Your First Template',
    content: [
      'Go to the Templates tab → Message Templates and click "Create Template".',
      'Write a greeting, message body (sentiment), and closing.',
      'Use [Tag Person] to @mention friends by name automatically.',
      'Optionally set "Days in Advance" to send early or as a follow-up.',
    ],
    note: 'Create multiple templates — the extension picks one at random for variety.',
  },
  {
    icon: '📅',
    title: 'Set a Schedule',
    content: [
      'Open the Scheduling tab and add a birthday message schedule.',
      'Choose when to send: on the birthday, days before, or days after.',
      'Set your timezone so messages are sent at the right time.',
    ],
  },
  {
    icon: '⚙️',
    title: 'Configure Automation',
    content: [
      'In the Scheduling tab, scroll to Automation Settings.',
      'Choose a check interval (how often to scan for birthdays).',
      'Set a Send Confirmation mode — "Each message" is the safest option.',
      'Adjust the delay between actions to reduce Facebook detection risk.',
    ],
    note: 'You can fine-tune Max Messages Per Run and other settings later.',
  },
  {
    icon: '🖥️',
    title: 'The Facebook Overlay',
    content: [
      'When you visit facebook.com/birthdays, a floating sidebar appears on the page.',
      "It lists today's birthday friends with checkboxes — select who to message.",
      'Use "Send to all" to send messages in one go, or click ▶ on a single friend.',
      'Toggle features: DM (direct message), Post (timeline post), and Archive (archive chat after sending).',
      'The status dot shows automation health: green = active, yellow = rate-limited, red = stopped.',
    ],
    note: 'Drag the title bar to reposition the overlay. Press Escape to hide it. Click ? for built-in tips.',
  },
  {
    icon: '🚀',
    title: "You're all set!",
    content: [
      "Home — toggle automation on, see today's summary and upcoming birthdays.",
      'Dashboard — view delivery stats, success rate, and activity trends.',
      'Templates — manage message templates, timeline posts, and images.',
      'Scheduling — adjust schedules, timezone, and automation settings.',
      'Message Queue — monitor pending, sent, and failed messages.',
      'Account — update your profile and manage your subscription.',
    ],
    note: 'Tip: Use Alt+H (Home) and Alt+D (Dashboard) for quick navigation. Look for the ? icons throughout the app for contextual help.',
  },
];

const TOTAL_STEPS = STEPS.length;

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isFirst = currentStep === 0;
  const isLast = currentStep === TOTAL_STEPS - 1;
  const current = STEPS[currentStep];

  // Trap focus inside the dialog
  useEffect(() => {
    dialogRef.current?.focus();
  }, [currentStep]);

  function handleNext() {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleBack() {
    setCurrentStep((s) => Math.max(0, s - 1));
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="rounded-xl w-full max-w-sm flex flex-col animate-fade-in"
        style={{
          padding: '2rem',
          gap: '1.25rem',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          border: '1.5px solid rgba(202, 79, 2, 0.18)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-400">
            <span aria-live="polite" className="text-textMuted">
              Step {currentStep + 1} of {TOTAL_STEPS}
            </span>
            <button
              type="button"
              onClick={onSkip}
              className="text-textMuted hover:text-textPrimary underline text-xs"
            >
              Skip tour
            </button>
          </div>
          <div
            className="w-full bg-gray-200 rounded-full h-1.5"
            role="progressbar"
            aria-valuenow={currentStep + 1}
            aria-valuemin={1}
            aria-valuemax={TOTAL_STEPS}
            aria-label={`Onboarding progress: step ${currentStep + 1} of ${TOTAL_STEPS}`}
          >
            <div
              className="bg-orangeStrong h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / TOTAL_STEPS) * 100}%` }}
            />
          </div>
          {/* Step dots */}
          <div className="flex justify-center gap-1.5 pt-1">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentStep(i)}
                aria-label={`Go to step ${i + 1}`}
                className="rounded-full transition-all duration-200"
                style={{
                  width: i === currentStep ? '1.25rem' : '0.5rem',
                  height: '0.5rem',
                  background: i === currentStep ? 'var(--color-orange-strong)' : '#d1d5db',
                }}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-3 overflow-y-auto max-h-[45vh] pr-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">
              {current.icon}
            </span>
            <h2 id="onboarding-title" className="font-bold text-base text-blueStrong">
              {current.title}
            </h2>
          </div>
          <ul className="space-y-1.5">
            {current.content.map((line, i) => (
              <li key={i} className="text-sm text-textMuted leading-relaxed flex gap-2">
                <span className="text-orangeStrong mt-0.5 shrink-0">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {current.note && (
            <p className="text-xs text-textMuted opacity-70 italic">{current.note}</p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-2 pt-2">
          {!isFirst && (
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 btn-secondary text-sm py-2"
              aria-label="Go to previous step"
            >
              ← Back
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            className="flex-1 btn-primary text-sm py-2"
            aria-label={isLast ? 'Finish onboarding' : 'Go to next step'}
          >
            {isLast ? 'Get Started' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
