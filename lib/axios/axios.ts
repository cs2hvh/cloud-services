"use client";
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { toast } from "sonner";

const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // ✅ CRITICAL: Ensures cookies are sent with requests
});

/**
 * Response interceptor with 401 retry logic
 *
 * IMPORTANT: We do NOT proactively refresh sessions here because:
 * 1. Middleware already handles session refresh on EVERY request (including API routes)
 * 2. Client-side refresh updates localStorage but NOT HTTP-only cookies synchronously
 * 3. This creates race conditions where the request is sent before cookies are updated
 *
 * Instead, we rely on:
 * - Middleware to refresh sessions (runs before API route handlers)
 * - This interceptor to retry 401s ONCE (gives middleware time to update cookies)
 */
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const serverMessage = (error.response?.data as { message?: string })
      ?.message;

    // Retry 401 errors once - the middleware will refresh session on the retry
    if (status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;

      console.log('[Axios] 401 error, retrying request (middleware will handle session refresh)...');

      // Small delay to allow cookie propagation from any concurrent requests
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        // Retry the request - middleware will refresh session if needed
        const retryResponse = await api(originalRequest);
        console.log('[Axios] Retry successful');
        return retryResponse;
      } catch (retryError) {
        console.error('[Axios] Retry failed, session truly expired');

        // Show error toast only once
        toast.error("Session expired - please login again.");

        // Redirect to login after delay
        setTimeout(() => {
          window.location.href = '/signin?session_expired=true';
        }, 1500);

        return Promise.reject(retryError);
      }
    }

    // Handle other error status codes
    if (status === 400) {
      toast.error(serverMessage || "Bad Request - invalid data provided.");
    } else if (status === 401) {
      // Only show toast if we didn't already retry (retry case handled above)
      if (!originalRequest?._retry) {
        toast.error(serverMessage || "Unauthorized - please login.");
      }
    } else if (status === 403) {
      toast.error(serverMessage || "Forbidden - access denied.");
    } else if (status === 402) {
      toast.error(serverMessage || "Insufficient credits. Please add credits to proceed.");
    } else if (status === 404) {
      toast.error(serverMessage || "Not found.");
    } else if (status === 429) {
      toast.error(serverMessage || "Too many requests. Please try again later.");
    } else if (status === 500) {
      toast.error(serverMessage || "Server error, please try again later.");
    } else if (status === 503) {
      toast.error("Our server is busy. Please try again later.");
    } else {
      toast.error(serverMessage || "Something went wrong.");
    }

    return Promise.reject(error);
  },
);

export default api;
