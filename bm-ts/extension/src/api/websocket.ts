/**
 * WebSocket client for real-time updates
 */

import { logError } from '../utils/errors';
import { logger } from '../utils/logger';

export type WebSocketEventType =
  | 'connected'
  | 'message_queue_update'
  | 'message_history_update'
  | 'dashboard_update'
  | 'notification';

export interface WebSocketMessage {
  type: WebSocketEventType;
  data: unknown;
  timestamp: string;
}

export interface WebSocketConfig {
  url: string;
  token: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

type EventCallback = (data: unknown) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000; // 3 seconds
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private isIntentionallyClosed = false;
  private eventListeners: Map<WebSocketEventType, Set<EventCallback>> = new Map();

  /**
   * Connect to WebSocket server
   */
  connect(config: WebSocketConfig): void {
    this.config = config;
    this.isIntentionallyClosed = false;
    this.createConnection();
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    this.cleanup();
  }

  /**
   * Subscribe to WebSocket events
   */
  on(eventType: WebSocketEventType, callback: EventCallback): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(eventType);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Create WebSocket connection
   */
  private createConnection(): void {
    if (!this.config) return;

    try {
      // Connect WITHOUT the token in the URL to avoid leaking it to logs/proxies.
      // Authentication is performed via the first message after the connection opens.
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onerror = (event) => this.handleError(event);
      this.ws.onclose = (event) => this.handleClose(event);
    } catch (error) {
      logError(error, 'WebSocketClient:createConnection');
      this.handleReconnect();
    }
  }

  /**
   * Handle connection opened
   */
  private handleOpen(): void {
    logger.log('[WebSocket] Connected');
    this.reconnectAttempts = 0;

    // Send the JWT as the first message instead of in the query string
    if (this.config?.token) {
      this.ws?.send(JSON.stringify({ type: 'auth', token: this.config.token }));
    }

    this.config?.onConnect?.();
    this.startPingTimer();
  }

  /**
   * Handle incoming message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      logger.log('[WebSocket] Message received:', message.type);

      // Emit event to all subscribers
      const listeners = this.eventListeners.get(message.type);
      if (listeners) {
        listeners.forEach((callback) => {
          try {
            // If you expect a specific type, cast here or add type guards
            callback(message.data);
          } catch (error) {
            logError(error, 'WebSocketClient:eventCallback');
          }
        });
      }
    } catch (error) {
      logError(error, 'WebSocketClient:handleMessage');
    }
  }

  /**
   * Handle connection error
   */
  private handleError(event: Event): void {
    logger.error('[WebSocket] Error:', event);
    const error = new Error('WebSocket connection error');
    this.config?.onError?.(error);
  }

  /**
   * Handle connection closed
   */
  private handleClose(event: CloseEvent): void {
    logger.log('[WebSocket] Disconnected:', event.code, event.reason);
    this.stopPingTimer();
    this.config?.onDisconnect?.();

    // Attempt to reconnect if not intentionally closed
    if (!this.isIntentionallyClosed) {
      this.handleReconnect();
    }
  }

  /**
   * Handle reconnection logic
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[WebSocket] Max reconnect attempts reached');
      const error = new Error('Failed to connect to WebSocket server after multiple attempts');
      this.config?.onError?.(error);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    logger.log(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    this.reconnectTimer = window.setTimeout(() => {
      this.createConnection();
    }, delay);
  }

  /**
   * Start ping timer to keep connection alive
   */
  private startPingTimer(): void {
    this.pingTimer = window.setInterval(() => {
      if (this.isConnected()) {
        this.ws?.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop ping timer
   */
  private stopPingTimer(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopPingTimer();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;

      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }

      this.ws = null;
    }

    this.eventListeners.clear();
  }
}

// Singleton instance
const wsClient = new WebSocketClient();

export default wsClient;
