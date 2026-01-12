'use client';

import React from 'react';

export interface CustomDomainsManagerProps {
  appId: string;
}

/**
 * CustomDomainsManager - Manage custom domains (stub)
 */
export function CustomDomainsManager({ appId }: CustomDomainsManagerProps) {
  const [domains] = React.useState([
    { id: '1', domain: 'example.com', status: 'active', is_primary: true },
  ]);

  return (
    <div data-testid="custom-domains-manager">
      <h2>Custom Domains</h2>
      
      <div data-testid="domains-list">
        {domains.map((domain) => (
          <div key={domain.id} data-testid="domain-item">
            <span>{domain.domain}</span>
            <span data-testid={`status-${domain.status}`}>{domain.status}</span>
            {domain.is_primary && <span data-testid="primary-badge">Primary</span>}
          </div>
        ))}
      </div>

      <button data-testid="add-domain-button">Add Domain</button>
    </div>
  );
}
