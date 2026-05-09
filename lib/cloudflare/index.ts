import Cloudflare from "cloudflare";

let cloudflareInstance: Cloudflare | null = null;

/**
 * Lazy Cloudflare client getter - instantiates only when accessed
 * Prevents build failures when CLOUDFLARE_API_TOKEN is missing at build time
 */
function getCloudflare(): Cloudflare {
  if (!cloudflareInstance) {
    if (!process.env.CLOUDFLARE_API_TOKEN) {
      throw new Error('CLOUDFLARE_API_TOKEN environment variable is not set');
    }
    cloudflareInstance = new Cloudflare({
      // apiEmail: "omkarjoshi9918@gmail.com", // This is the default and can be omitted
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    });
  }
  return cloudflareInstance;
}

/**
 * Export cloudflare as a Proxy that lazily instantiates on property access
 */
const cloudflare = new Proxy({} as Cloudflare, {
  get(target, prop) {
    const instance = getCloudflare();
    const value = instance[prop as keyof Cloudflare];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  }
});

export default cloudflare;
