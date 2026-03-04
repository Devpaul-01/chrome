/**
 * OnboardingWizard.tsx — First-run guided setup wizard.
 *
 * Shown the first time an authenticated user opens the popup.
 * Presents 5 short steps that orient the user to the key features.
 * The wizard renders as a full-screen overlay so it sits above all other content.
 */

import { useState } from 'react';

interface OnboardingWizardProps {
  /** Called when the user explicitly completes the final step. */
  onComplete: () => void;
  /** Called when the user presses "Skip tour" at any step. */
  onSkip: () => void;
}

interface WizardStep {
  title: string;
  content: string[];
  note?: string;
}

const STEPS: WizardStep[] = [
  {
    title: 'Welcome to Birthday Messaging! 🎉',
    content: [
      'This extension automatically sends personalised birthday messages to your Facebook friends.',
      "Let's walk you through the key features so you can get started in minutes.",
    ],
  },
  {
    title: 'Set Up Your Account',
    content: [
      'Head to the Settings tab to configure your Backend URL — the address of your Birthday Messaging server.',
      'You can also set up SMTP settings there for optional email delivery notifications.',
    ],
    note: 'You can change these settings at any time.',
  },
  {
    title: 'Create Your First Template',
    content: [
      'Go to the Messages tab and click "+ New Template".',
      'Write a greeting, message body, and closing. Use merge tags like [Tag Person] to personalise each message.',
      'Set how many days before the birthday the message should be sent.',
    ],
  },
  {
    title: 'Schedule Your First Automation',
    content: [
      'Open the Scheduling tab to configure when the automation runs each day.',
      'Set a message limit per run to stay within safe activity levels.',
      'Enable automation to let the extension send messages automatically.',
    ],
  },
  {
    title: "You're all set! 🚀",
    content: [
      'Home — run automation, view message queue & history.',
      'Contacts — manage your friends list and import birthdays.',
      'Messages — create and edit message templates.',
      'Settings — SMTP, scheduling, and account options.',
    ],
    note: 'Pro tip: Use keyboard shortcuts Alt+H (Home) and Alt+D (Dashboard).',
  },
];

const TOTAL_STEPS = STEPS.length;

export default function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const isFirst = currentStep === 0;
  const isLast = currentStep === TOTAL_STEPS - 1;
  const current = STEPS[currentStep];

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
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm flex flex-col gap-4 p-6">
        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span aria-live="polite">
              Step {currentStep + 1} of {TOTAL_STEPS}
            </span>
            <button
              type="button"
              onClick={onSkip}
              className="text-gray-400 hover:text-gray-600 underline"
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
        </div>

        {/* Content */}
        <div className="space-y-3">
          <h2 id="onboarding-title" className="font-semibold text-base text-gray-900">
            {current.title}
          </h2>
          <ul className="space-y-1.5">
            {current.content.map((line, i) => (
              <li key={i} className="text-sm text-gray-600 leading-relaxed flex gap-2">
                <span className="text-orangeStrong mt-0.5 shrink-0">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {current.note && (
            <p className="text-xs text-gray-400 italic">{current.note}</p>
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
            className="flex-1 bg-orangeStrong text-white text-sm py-2 rounded hover:bg-orangeBrand transition-colors font-medium"
            aria-label={isLast ? 'Finish onboarding' : 'Go to next step'}
          >
            {isLast ? 'Get Started' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
