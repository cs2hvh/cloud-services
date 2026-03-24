// Shared types for the Domain Marketplace feature

export interface MarketplaceSummary {
  channel: 'ahuracloud';
  configured: boolean;
  mode: 'managed_reseller';
  capabilities: {
    search: true;
    purchase_requests: true;
    auto_fulfillment: boolean;
  };
  notes: string;
}

export interface SearchResultItem {
  domainName: string;
  available: boolean;
  premium: boolean;
  purchasePrice: number | null;
  renewalPrice: number | null;
  currency: string;
  purchaseType: string | null;
  reason: string | null;
  fulfillment: 'ahuracloud';
}

export interface PurchaseRequest {
  id: string;
  domain: string;
  app_id: string | null;
  status: 'requested' | 'processing' | 'completed' | 'failed' | 'cancelled';
  purchase_price: number | null;
  renewal_price: number | null;
  currency: string;
  created_at: string;
  last_error: string | null;
}
