import axios, { AxiosInstance } from "axios";

/**
 * DigitalOcean API Client
 * Provides configured axios instance for DigitalOcean API requests
 */
export class DigitalOceanClient {
  public client: AxiosInstance;
  private token: string;

  constructor(token?: string) {
    this.token = token || process.env.DIGITAL_OCEAN_TOKEN || "";
    
    if (!this.token) {
      throw new Error("DigitalOcean token is required");
    }

    this.client = axios.create({
      baseURL: "https://api.digitalocean.com",
      headers: {
        Authorization: `${this.token}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }
}

/**
 * Create a DigitalOcean client instance
 * @param token Optional token, will use env var if not provided
 */
export function createDOClient(token?: string): DigitalOceanClient {
  return new DigitalOceanClient(token);
}
