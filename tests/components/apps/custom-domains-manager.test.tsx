import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomDomainsManager } from '@/components/dashboard/apps/custom-domains-manager';

/**
 * CustomDomainsManager Component Tests
 */
describe('CustomDomainsManager', () => {
  it('TC-PA-C050: should render domains manager', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('custom-domains-manager')).toBeInTheDocument();
  });

  it('TC-PA-C051: should display domain list', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('domains-list')).toBeInTheDocument();
  });

  it('TC-PA-C052: should show add domain button', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('add-domain-button')).toBeInTheDocument();
  });

  it('TC-PA-C053: should display domain items', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('domain-item')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('TC-PA-C054: should show domain status', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('status-active')).toBeInTheDocument();
  });

  it('TC-PA-C055: should show primary badge', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('primary-badge')).toBeInTheDocument();
  });
});
