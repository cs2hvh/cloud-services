const PREFIX = "[EmailService]";

export const emailLogger = {
  info(message: string, context?: Record<string, unknown>) {
    console.info(PREFIX, message, context ?? {});
  },
  warn(message: string, context?: Record<string, unknown>) {
    console.warn(PREFIX, message, context ?? {});
  },
  error(message: string, context?: Record<string, unknown>) {
    console.error(PREFIX, message, context ?? {});
  },
};
