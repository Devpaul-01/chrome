import { FormEvent, useState } from 'react';

export type SMTPConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail?: string;
};

type SMTPSettingsProps = {
  config?: SMTPConfig;
  onSave: (config: SMTPConfig) => Promise<void>;
  onBack: () => void;
  isSubmitting: boolean;
  message: string | null;
};

export default function SMTPSettings({
  config,
  onSave,
  onBack,
  isSubmitting,
  message,
}: SMTPSettingsProps) {
  const [host, setHost] = useState(config?.host || '');
  const [port, setPort] = useState(config?.port?.toString() || '587');
  const [username, setUsername] = useState(config?.username || '');
  const [password, setPassword] = useState(config?.password || '');
  const [fromEmail, setFromEmail] = useState(config?.fromEmail || '');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSave({
      host: host.trim(),
      port: parseInt(port, 10),
      username: username.trim(),
      password: password.trim(),
      fromEmail: fromEmail.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-blueStrong hover:underline">
        <span className="text-xl">‹</span>
        <span>Back</span>
      </button>

      <div className="card">
        <h2 className="text-xl font-bold text-blueStrong mb-4">Email SMTP Settings</h2>

        <p className="text-sm text-gray-600 mb-4">
          Sets the e-mail address from which the system will send messages. By default, this is the
          address associated with your Google user account. If you want to use your own email, fill
          in the details of your SMTP server (Email account SMTP other than default Google account)
          below.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Host */}
          <div>
            <label htmlFor="host" className="block text-sm font-medium mb-1">
              Host
            </label>
            <input
              type="text"
              id="host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="Enter SMTP host (e.g., smtp.gmail.com)"
              required
              className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
            />
          </div>

          {/* Port */}
          <div>
            <label htmlFor="port" className="block text-sm font-medium mb-1">
              Port
            </label>
            <input
              type="number"
              id="port"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="E.g 587"
              required
              min="1"
              max="65535"
              className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
            />
            <p className="text-xs text-gray-500 mt-1">
              Common ports: 587 (TLS), 465 (SSL), 25 (non-encrypted)
            </p>
          </div>

          {/* SMTP Username */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1">
              SMTP Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter SMTP username"
              required
              className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
            />
          </div>

          {/* SMTP Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              SMTP Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter SMTP password"
                required
                className="w-full px-3 py-2 pr-10 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              For Gmail, use an App Password instead of your regular password
            </p>
          </div>

          {/* From Email (Optional) */}
          <div>
            <label htmlFor="fromEmail" className="block text-sm font-medium mb-1">
              From Email Address <span className="text-gray-400">(Optional)</span>
            </label>
            <input
              type="email"
              id="fromEmail"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full px-3 py-2 rounded-lg focus:outline-none bg-white shadow-sm focus:shadow-lg transition-shadow"
            />
            <p className="text-xs text-gray-500 mt-1">
              If not specified, will use the SMTP username as the from address
            </p>
          </div>

          {/* Message */}
          {message && (
            <div
              className={`p-3 rounded text-sm ${
                message.toLowerCase().includes('success')
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {message}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onBack} className="btn-secondary" disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
