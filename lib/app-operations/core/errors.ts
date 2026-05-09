export class AppOperationError extends Error {
  code: string;
  statusCode: number;
  retryable: boolean;

  constructor(params: {
    code: string;
    message: string;
    statusCode?: number;
    retryable?: boolean;
  }) {
    super(params.message);
    this.name = "AppOperationError";
    this.code = params.code;
    this.statusCode = params.statusCode ?? 500;
    this.retryable = params.retryable ?? false;
  }
}
