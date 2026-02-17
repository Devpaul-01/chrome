// Development logger utility for better debugging
// Only logs in development mode (when built without --mode production)

const isDevelopment = process.env.NODE_ENV !== 'production';

const logPrefix = '[BM Background]';

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.log(`${logPrefix} ℹ️`, message, ...args);
    }
  },

  error: (message: string, error?: unknown, ...args: unknown[]) => {
    console.error(`${logPrefix} ❌`, message, error, ...args);
  },

  warn: (message: string, ...args: unknown[]) => {
    console.warn(`${logPrefix} ⚠️`, message, ...args);
  },

  debug: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(`${logPrefix} 🔍`, message, ...args);
    }
  },

  success: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.log(`${logPrefix} ✅`, message, ...args);
    }
  },
};

export default logger;
