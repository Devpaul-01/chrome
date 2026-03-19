import { useCallback, useEffect, useState } from 'react';
import { sendBackgroundMessage } from '../api';
import { getErrorMessage, logError } from '../../utils/errors';
import { useAppContext } from '../context/AppContext';
import type { SMTPConfig } from '../components/SMTPSettings';

export function useSMTPConfig() {
  const { user, showToast, setViewMode } = useAppContext();
  const [smtpConfig, setSMTPConfig] = useState<SMTPConfig | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadSMTPConfig = useCallback(async () => {
    try {
      const data = await sendBackgroundMessage<SMTPConfig | null>({ type: 'smtp.getConfig' });
      setSMTPConfig(data);
    } catch (error) {
      // SMTP config is optional; don't surface an error toast
      logError(error, 'loadSMTPConfig');
      setSMTPConfig(null);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setSMTPConfig(null);
      return;
    }
    void loadSMTPConfig();
  }, [user, loadSMTPConfig]);

  const handleSaveSMTPConfig = useCallback(
    async (config: SMTPConfig): Promise<void> => {
      setIsSubmitting(true);
      setMessage(null);
      try {
        const updated = await sendBackgroundMessage<SMTPConfig>({
          type: 'smtp.updateConfig',
          payload: config,
        });
        setSMTPConfig(updated);
        showToast('SMTP settings saved successfully!', 'success');
        setViewMode('main');
      } catch (error) {
        const msg = getErrorMessage(error);
        logError(error, 'handleSaveSMTPConfig');
        setMessage(msg);
        showToast(msg, 'error');
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [showToast, setViewMode],
  );

  return { smtpConfig, isSubmitting, message, handleSaveSMTPConfig };
}
