import Cloudflare from 'cloudflare';

const cloudflare = new Cloudflare({
    // apiEmail: "omkarjoshi9918@gmail.com", // This is the default and can be omitted
    // apiKey: "ghHbAiBgvA14ArB_bi19C_RvAZkLy80BKNJGIOsf", // This is the default and can be omitted
    apiToken: process.env.CLOUDFLARE_API_TOKEN
});

export default cloudflare
