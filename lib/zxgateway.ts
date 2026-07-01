import axios from 'axios';

/**
 * ZX Gateway API Client
 * Client for cryptocurrency payment processing.
 *
 * Configured via ZXGATEWAY_URL + ZXGATEWAY_API_KEY. The shared
 * ZXGATEWAY_API_SECRET is used by the callback route to verify webhook
 * signatures (x-zx-signature) and never touches this client.
 */
export const zxgateway = axios.create({
    baseURL: process.env.ZXGATEWAY_URL,
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ZXGATEWAY_API_KEY,
    },
    timeout: 30000,
});
