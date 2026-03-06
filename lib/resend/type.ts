export interface ApiResponse {
  success: boolean;
  message: string;
  id?: string;
  error?: unknown;
}
