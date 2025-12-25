import Cloudflare from 'cloudflare';

const cloudflare = new Cloudflare({
    apiToken: process.env.CLOUDFLARE_API_TOKEN
});

export default cloudflare;
