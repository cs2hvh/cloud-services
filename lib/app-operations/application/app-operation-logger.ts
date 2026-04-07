type LogValue = string | number | boolean | null | undefined;

export class AppOperationLogger {
  constructor(private readonly context: Record<string, LogValue>) {}

  child(extra: Record<string, LogValue>) {
    return new AppOperationLogger({
      ...this.context,
      ...extra,
    });
  }

  info(message: string, extra?: Record<string, unknown>) {
    console.log("[AppOperation]", message, {
      ...this.context,
      ...(extra ?? {}),
    });
  }

  warn(message: string, extra?: Record<string, unknown>) {
    console.warn("[AppOperation]", message, {
      ...this.context,
      ...(extra ?? {}),
    });
  }

  error(message: string, extra?: Record<string, unknown>) {
    console.error("[AppOperation]", message, {
      ...this.context,
      ...(extra ?? {}),
    });
  }
}
