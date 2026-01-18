'use client';

import React, { useState } from 'react';

export interface AppCreateFormProps {
  onSuccess?: (appId: string) => void;
  onCancel?: () => void;
}

/**
 * AppCreateForm - Multi-step deployment wizard (stub)
 */
export function AppCreateForm({ onSuccess }: AppCreateFormProps) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    provider: '',
    repository: '',
    branch: '',
    framework: '',
    size: 'small',
    envVars: [] as { key: string; value: string }[],
  });

  return (
    <div data-testid="app-create-form">
      <div data-testid="step-indicator">Step {step} of 4</div>
      
      {step === 1 && (
        <div data-testid="step-1">
          <h2>Select Git Provider</h2>
          <button onClick={() => setFormData({ ...formData, provider: 'github' })}>GitHub</button>
          <button onClick={() => setFormData({ ...formData, provider: 'gitlab' })}>GitLab</button>
          <button disabled={!formData.provider} onClick={() => setStep(2)}>Next</button>
        </div>
      )}

      {step === 2 && (
        <div data-testid="step-2">
          <h2>Select Repository</h2>
          <input
            data-testid="repository-input"
            value={formData.repository}
            onChange={(e) => setFormData({ ...formData, repository: e.target.value })}
            placeholder="owner/repo"
          />
          <input
            data-testid="branch-input"
            value={formData.branch}
            onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
            placeholder="main"
          />
          <button onClick={() => setStep(1)}>Back</button>
          <button disabled={!formData.repository || !formData.branch} onClick={() => setStep(3)}>
            Next
          </button>
        </div>
      )}

      {step === 3 && (
        <div data-testid="step-3">
          <h2>Configure Build</h2>
          <select
            data-testid="framework-select"
            value={formData.framework}
            onChange={(e) => setFormData({ ...formData, framework: e.target.value })}
          >
            <option value="">Select framework</option>
            <option value="Next.js">Next.js</option>
            <option value="React">React</option>
            <option value="Python">Python</option>
          </select>
          <select
            data-testid="size-select"
            value={formData.size}
            onChange={(e) => setFormData({ ...formData, size: e.target.value })}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
          <button onClick={() => setStep(2)}>Back</button>
          <button disabled={!formData.framework} onClick={() => setStep(4)}>Next</button>
        </div>
      )}

      {step === 4 && (
        <div data-testid="step-4">
          <h2>Environment Variables</h2>
          <button
            data-testid="add-env-var"
            onClick={() =>
              setFormData({
                ...formData,
                envVars: [...formData.envVars, { key: '', value: '' }],
              })
            }
          >
            Add Variable
          </button>
          <button onClick={() => setStep(3)}>Back</button>
          <button
            data-testid="deploy-button"
            onClick={() => {
              if (onSuccess) onSuccess('app-123');
            }}
          >
            Deploy
          </button>
        </div>
      )}
    </div>
  );
}
