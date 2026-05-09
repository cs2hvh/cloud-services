"use client";
import axios, { AxiosError } from "axios";
import { toast } from "sonner";

const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json"
  },
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const url = error.config?.url || 'unknown';
    const serverPayload = error.response?.data as { message?: string; error?: string } | undefined;
    const serverMessage = serverPayload?.message || serverPayload?.error;

    // Log 4xx as warnings (client errors), 5xx as errors (server faults)
    if (status && status >= 500) {
      console.error(`[API ${status}] ${url}`, serverMessage || error.message);
    } else {
      console.warn(`[API ${status}] ${url}`, serverMessage || error.message);
    }

    if (status === 400) {
      toast.error(serverMessage || "Bad Request - invalid data provided.");
    } else if (status === 401) {
      toast.error(serverMessage || "Unauthorized - please login.");
    } else if (status === 403) {
      toast.error(serverMessage || "Forbidden - access denied.");
    } else if (status === 402) {
      toast.error(serverMessage || "Insufficient credits. Please add credits to proceed.");
    } else if (status === 404) {
      toast.error(serverMessage || "Not found.");
    } else if (status === 500) {
      toast.error(serverMessage || "Server error, please try again later.");
    } else if (status === 503) {
      toast.error("Our server is busy. Please try again later.");
    } else {
      toast.error(serverMessage || "Something went wrong.");
    }

    return Promise.resolve({ error, data: null });
  },
);

export default api;
