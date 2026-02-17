import { useCallback } from 'react';
import type {
  RegisterPayload,
  TokenResponse,
  TemplateSegment,
  UserProfile,
  SubscriptionStatus,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
} from '../../api/client';
import type { BackgroundMessage } from '../../utils/messages';
import { sendBackgroundMessage } from '../api';

type ApiErrorLike = { message?: string } | string;

function serializeError(e: unknown): string {
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function handleError(e: unknown): never {
  if (e && typeof e === 'object' && 'message' in e) {
    const fallbackMessage = `Unknown API error: ${serializeError(e)}`;
    const errorMessage = (e as { message?: string }).message ?? fallbackMessage;
    throw new Error(errorMessage);
  }
  throw new Error(String(e));
}

export default function useApi() {
  const register = useCallback(async (payload: RegisterPayload): Promise<TokenResponse> => {
    try {
      return await sendBackgroundMessage<TokenResponse>({
        type: 'auth.register',
        payload,
      } as BackgroundMessage);
    } catch (e) {
      handleError(e);
    }
  }, []);

  const login = useCallback(async (payload: RegisterPayload): Promise<TokenResponse> => {
    try {
      return await sendBackgroundMessage<TokenResponse>({
        type: 'auth.login',
        payload,
      } as BackgroundMessage);
    } catch (e) {
      handleError(e);
    }
  }, []);

  const me = useCallback(async (): Promise<UserProfile> => {
    try {
      return await sendBackgroundMessage<UserProfile>({ type: 'auth.me' } as BackgroundMessage);
    } catch (e) {
      handleError(e);
    }
  }, []);

  const listTemplates = useCallback(async (): Promise<TemplateSegment[]> => {
    try {
      return await sendBackgroundMessage<TemplateSegment[]>({
        type: 'templates.list',
      } as BackgroundMessage);
    } catch (e) {
      handleError(e);
    }
  }, []);

  const createTemplate = useCallback(
    async (
      segmentType: TemplateSegment['segment_type'],
      content: string,
      label?: string,
    ): Promise<TemplateSegment> => {
      try {
        return await sendBackgroundMessage<TemplateSegment>({
          type: 'templates.create',
          payload: { segmentType, content, label },
        } as BackgroundMessage);
      } catch (e) {
        handleError(e);
      }
    },
    [],
  );

  const updateTemplate = useCallback(
    async (id: string, content?: string, label?: string): Promise<TemplateSegment> => {
      try {
        return await sendBackgroundMessage<TemplateSegment>({
          type: 'templates.update',
          payload: { id, content, label },
        } as BackgroundMessage);
      } catch (e) {
        handleError(e);
      }
    },
    [],
  );

  const deleteTemplate = useCallback(async (id: string): Promise<void> => {
    try {
      await sendBackgroundMessage<void>({
        type: 'templates.delete',
        payload: { id },
      } as BackgroundMessage);
    } catch (e) {
      handleError(e);
    }
  }, []);

  const subscriptionStatus = useCallback(async (): Promise<SubscriptionStatus> => {
    try {
      return await sendBackgroundMessage<SubscriptionStatus>({
        type: 'subscription.status',
      } as BackgroundMessage);
    } catch (e) {
      handleError(e);
    }
  }, []);

  const createCheckoutSession = useCallback(
    async (payload: CheckoutSessionRequest): Promise<CheckoutSessionResponse> => {
      try {
        return await sendBackgroundMessage<CheckoutSessionResponse>({
          type: 'subscription.checkout',
          payload,
        } as BackgroundMessage);
      } catch (e) {
        handleError(e);
      }
    },
    [],
  );

  const getBackendUrl = useCallback(async (): Promise<{ backendUrl: string }> => {
    try {
      return await sendBackgroundMessage<{ backendUrl: string }>({
        type: 'config.getBackendUrl',
      } as BackgroundMessage);
    } catch (e) {
      handleError(e);
    }
  }, []);

  const setBackendUrl = useCallback(async (backendUrl: string): Promise<{ backendUrl: string }> => {
    try {
      return await sendBackgroundMessage<{ backendUrl: string }>({
        type: 'config.setBackendUrl',
        payload: { backendUrl },
      } as BackgroundMessage);
    } catch (e) {
      handleError(e);
    }
  }, []);

  const fireAutomationScan = useCallback(async (): Promise<{ success: boolean }> => {
    try {
      return await sendBackgroundMessage<{ success: boolean }>({
        type: 'automation.scanFacebook',
      } as BackgroundMessage);
    } catch (e) {
      handleError(e);
    }
  }, []);

  return {
    register,
    login,
    me,
    listTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    subscriptionStatus,
    createCheckoutSession,
    getBackendUrl,
    setBackendUrl,
    fireAutomationScan,
  };
}
