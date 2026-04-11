import axios from 'axios';

/**
 * crgateway API Client
 * Client for cryptocurrency payment processing
 */
export const crgateway = axios.create({
    baseURL: process.env.CRGATEWAY_URL,
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CRGATEWAY_API_KEY,
    },
    timeout: 30000,
});
