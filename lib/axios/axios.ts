"use client";
import axios, { AxiosError } from "axios";
import { toast } from "sonner";

const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    "x-client-secret": process.env.NEXT_PUBLIC_CLIENT_SECRET,
  },
  withCredentials: true, // ✅ CRITICAL: Ensures cookies are sent with requests
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const serverMessage = (error.response?.data as { message?: string })
      ?.message;

    if (status === 400) {
      toast.error(serverMessage || "Bad Request - invalid data provided.");
    } else if (status === 401) {
      toast.error(serverMessage || "Unauthorized - please login.");
    } else if (status === 403) {
      toast.error(serverMessage || "Forbidden - access denied.");
    } else if (status === 402) {
      toast.error(serverMessage || "Insufficient credits.please add credits to proceed.");
    } else if (status === 404) {
      toast.error(serverMessage || "Not found.");
    } else if (status === 429) {
      toast.error(serverMessage || "Too many requests. Please try again later.");
    } else if (status === 500) {
      toast.error(serverMessage || "Server error, please try again later.");
    } else if (status === 503) {
      toast.error("our server is busy. please try after sometimes.");
    } else {
      toast.error(serverMessage || "Something went wrong.");
    }

    return Promise.resolve({ error, data: null });
  },
);

export default api;
