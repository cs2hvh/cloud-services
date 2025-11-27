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
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
   // debugger
    const status = error.response?.status;
    const serverMessage = (error.response?.data as { message?: string })
      ?.message;

      // console.log(error.response?.data,".............axios error interceptors...........");
      // console.log(error.response,".............axios error interceptors...........");
      //  console.log(error,".............axios error interceptors...........");

    if (status === 400) {
      toast.error("our server is busy. please try after sometimes");
    } else if (status === 401) {
      toast.error(serverMessage || "Unauthorized - please login.");
    } else if (status === 403) {
      toast.error(serverMessage || "Forbidden - access denied.");
    } else if (status === 404) {
      toast.error(serverMessage || "Not found.");
    } else if (status === 500) {
      toast.error(serverMessage || "Server error, please try again later.");
    } else {
      toast.error(serverMessage || "Something went wrong.");
    }

    return Promise.resolve({ error, data: null });
  },
);

export default api;
