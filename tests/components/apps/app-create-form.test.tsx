import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppCreateForm } from '@/components/dashboard/apps/app-create-form';

/**
 * AppCreateForm Component Tests
 */
describe('AppCreateForm', () => {
  it('TC-PA-C001: should render initial step', () => {
    render(<AppCreateForm />);
    expect(screen.getByTestId('app-create-form')).toBeInTheDocument();
    expect(screen.getByText(/Step 1/)).toBeInTheDocument();
  });

  it('TC-PA-C002: should show git provider selection', () => {
    render(<AppCreateForm />);
    expect(screen.getByText(/Select Git Provider/i)).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('GitLab')).toBeInTheDocument();
  });

  it('TC-PA-C003: should navigate to step 2', async () => {
    const user = userEvent.setup();
    render(<AppCreateForm />);

    await user.click(screen.getByText('GitHub'));
    await user.click(screen.getByText('Next'));

    expect(screen.getByText(/Step 2/)).toBeInTheDocument();
    expect(screen.getByText(/Select Repository/i)).toBeInTheDocument();
  });

  it('TC-PA-C004: should accept repository input', async () => {
    const user = userEvent.setup();
    render(<AppCreateForm />);

    await user.click(screen.getByText('GitHub'));
    await user.click(screen.getByText('Next'));

    const repoInput = screen.getByTestId('repository-input');
    await user.type(repoInput, 'user/repo');

    expect(repoInput).toHaveValue('user/repo');
  });

  it('TC-PA-C005: should navigate to step 3', async () => {
    const user = userEvent.setup();
    render(<AppCreateForm />);

    await user.click(screen.getByText('GitHub'));
    await user.click(screen.getByText('Next'));
    await user.type(screen.getByTestId('repository-input'), 'user/repo');
    await user.type(screen.getByTestId('branch-input'), 'main');
    await user.click(screen.getAllByText('Next')[0]);

    expect(screen.getByText(/Step 3/)).toBeInTheDocument();
  });

  it('TC-PA-C006: should select framework', async () => {
    const user = userEvent.setup();
    render(<AppCreateForm />);

    await user.click(screen.getByText('GitHub'));
    await user.click(screen.getByText('Next'));
    await user.type(screen.getByTestId('repository-input'), 'user/repo');
    await user.type(screen.getByTestId('branch-input'), 'main');
    await user.click(screen.getAllByText('Next')[0]);

    const frameworkSelect = screen.getByTestId('framework-select');
    await user.selectOptions(frameworkSelect, 'Next.js');

    expect(frameworkSelect).toHaveValue('Next.js');
  });

  it('TC-PA-C007: should navigate to step 4', async () => {
    const user = userEvent.setup();
    render(<AppCreateForm />);

    // Step 1: Select provider
    await user.click(screen.getByText('GitHub'));
    await user.click(screen.getByText('Next'));
    
    // Step 2: Enter repository and branch
    await user.type(screen.getByTestId('repository-input'), 'user/repo');
    await user.type(screen.getByTestId('branch-input'), 'main');
    await user.click(screen.getByText('Next'));
    
    // Step 3: Select framework and go to step 4
    await user.selectOptions(screen.getByTestId('framework-select'), 'Next.js');
    await user.click(screen.getByText('Next'));

    expect(screen.getByText(/Step 4/)).toBeInTheDocument();
    expect(screen.getByText(/Environment Variables/i)).toBeInTheDocument();
  });

  it('TC-PA-C008: should call onSuccess on deploy', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<AppCreateForm onSuccess={onSuccess} />);

    // Step 1: Select provider
    await user.click(screen.getByText('GitHub'));
    await user.click(screen.getByText('Next'));
    
    // Step 2: Enter repository and branch
    await user.type(screen.getByTestId('repository-input'), 'user/repo');
    await user.type(screen.getByTestId('branch-input'), 'main');
    await user.click(screen.getByText('Next'));
    
    // Step 3: Select framework
    await user.selectOptions(screen.getByTestId('framework-select'), 'Next.js');
    await user.click(screen.getByText('Next'));
    
    // Step 4: Click deploy
    await user.click(screen.getByTestId('deploy-button'));

    expect(onSuccess).toHaveBeenCalledWith('app-123');
  });
});
