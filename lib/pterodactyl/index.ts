import axios from 'axios';

const ptero_axios = axios.create({
    baseURL: process.env.PTERO_DOMAIN, // Set the base URL
});

// Add a request interceptor
ptero_axios.interceptors.request.use(
    config => {
        config.headers['Content-Type'] = 'application/json'; // Fixed typo from 'Content' to 'Content-Type'
        config.headers['Accept'] = 'application/json';
        config.headers['Authorization'] = `Bearer ${process.env.PTERO_API_KEY}`;
        return config;
    },
    error => {
        return Promise.reject(error);
    }
);

export default ptero_axios;
