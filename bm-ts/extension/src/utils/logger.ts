// Development logger utility for better debugging
// Only logs in development mode (when built without --mode production)

const isDevelopment = import.meta.env.MODE !== 'production';

export const logger = {
  log: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.log(message, ...args);
    }
  },

  info: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.log(message, ...args);
    }
  },

  error: (message: string, error?: unknown, ...args: unknown[]) => {
    // Errors are always logged regardless of mode
    console.error(message, error, ...args);
  },

  warn: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.warn(message, ...args);
    }
  },

  debug: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(message, ...args);
    }
  },

  success: (message: string, ...args: unknown[]) => {
    if (isDevelopment) {
      console.log(message, ...args);
    }
  },
};

export default logger;
