import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomDomainsManager } from '@/components/dashboard/apps/custom-domains-manager';

/**
 * CustomDomainsManager Component Tests
 */
describe('CustomDomainsManager', () => {
  it('TC-PA-C130: should render domains manager', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('custom-domains-manager')).toBeInTheDocument();
  });

  it('TC-PA-C131: should display domain list', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('domains-list')).toBeInTheDocument();
  });

  it('TC-PA-C132: should show add domain button', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('add-domain-button')).toBeInTheDocument();
  });

  it('TC-PA-C133: should display domain items', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('domain-item')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('TC-PA-C134: should show domain status', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('status-active')).toBeInTheDocument();
  });

  it('TC-PA-C135: should show primary badge', () => {
    render(<CustomDomainsManager appId="app-123" />);
    expect(screen.getByTestId('primary-badge')).toBeInTheDocument();
  });
});
