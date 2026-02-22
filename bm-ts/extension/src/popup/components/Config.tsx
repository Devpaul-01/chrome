import { useCallback, useEffect, useState } from 'react';
import { sendBackgroundMessage } from '../api';

type Props = {
  onSaved?: () => Promise<void> | void;
};

export default function Config({ onSaved }: Props) {
  const [backendUrl, setBackendUrl] = useState('http://localhost:8000');
  const [isSaving, setIsSaving] = useState(false);

  const loadBackendUrl = useCallback(async () => {
    try {
      const config = await sendBackgroundMessage<{ backendUrl: string }>({
        type: 'config.getBackendUrl',
      });
      if (config?.backendUrl) setBackendUrl(config.backendUrl);
    } catch (err) {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadBackendUrl();
  }, [loadBackendUrl]);

  async function handleSave() {
    setIsSaving(true);
    try {
      await sendBackgroundMessage<{ backendUrl: string }>({
        type: 'config.setBackendUrl',
        payload: { backendUrl },
      });
      if (onSaved) await onSaved();
    } catch (err) {
      console.error('Failed to save backend url', err);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="card">
      <h3 className="text-base font-bold text-blueStrong mb-5">Configuration</h3>

      <div className="bg-blue-50 rounded-lg p-3 mb-5 border-l-4 border-blue-400">
        <p className="text-xs text-blue-800">
          <strong>Note:</strong> This setting configures where the extension connects to the backend
          API. Only change if you're using a custom deployment.
        </p>
      </div>

      <label className="block mb-5">
        <span className="text-xs font-semibold text-textPrimary mb-2 block">Backend URL</span>
        <input
          value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          className="text-field w-full"
          placeholder="http://localhost:8000"
          type="url"
        />
        <p className="text-xs text-gray-500 mt-2">
          Default:{' '}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-orange-600">
            http://localhost:8000
          </code>
        </p>
      </label>

      <button onClick={handleSave} className="btn-primary btn-block" disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save Configuration'}
      </button>
    </div>
  );
}
