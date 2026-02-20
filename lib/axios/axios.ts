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
   // debugger
   
    const status = error.response?.status;
    const serverMessage = (error.response?.data as { message?: string })
      ?.message;
      // console.log(error.response?.data,".............axios error interceptors...........");
      // console.log(error.response,".............axios error interceptors...........");
      //  console.log(error,".............axios error interceptors...........");

    if (status === 400) {
      //console.log(serverMessage,".............axios 400 error...........");
      toast.error(serverMessage||"Bad Request - invalid data provided.");
    } else if (status === 401) {
      toast.error(serverMessage || "Unauthorized - please login.");
    } else if (status === 403) {
      toast.error(serverMessage || "Forbidden - access denied.");
    }
    else if (status === 402) {
     // console.log(serverMessage,".............axios 402 error...........");
      toast.error(serverMessage || "Insufficient credits.please add credits to proceed.");
     // router.push('dashboard/nav/billing');
    }
     else if (status === 404) {
      toast.error(serverMessage || "Not found.");
    } else if (status === 500) {
      toast.error(serverMessage || "Server error, please try again later.");
    }else if(status===503){
      toast.error("our server is busy. please try after sometimes.");
    }
     else {
      toast.error(serverMessage || "Something went wrong.");
    }

    return Promise.resolve({ error, data: null });
  },
);

export default api;