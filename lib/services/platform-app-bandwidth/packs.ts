import { GB } from "./constants";

export type BandwidthPackId = "100gb" | "500gb" | "1tb";

export interface BandwidthPack {
  id: BandwidthPackId;
  label: string;
  bytes: number;
  price: number; // USD, charged from credit balance
}

export const BANDWIDTH_PACKS: Record<BandwidthPackId, BandwidthPack> = {
  "100gb": { id: "100gb", label: "100 GB",  bytes: 100  * GB, price: 5.00  },
  "500gb": { id: "500gb", label: "500 GB",  bytes: 500  * GB, price: 20.00 },
  "1tb":   { id: "1tb",   label: "1 TB",    bytes: 1024 * GB, price: 35.00 },
};

export const BANDWIDTH_PACK_LIST = Object.values(BANDWIDTH_PACKS);
