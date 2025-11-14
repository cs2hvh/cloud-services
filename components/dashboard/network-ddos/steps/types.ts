export interface SpectrumFormData {
  // Step 1: App Type
  appType: 'tcp' | 'udp' | '';

  // Step 2: Domain
  domain: string;

  // Step 3: Edge Port
  edgePort: number;

  // Step 4: Origin
  originType: 'ip-dns' | 'load-balancer' | '';
  originIP: string;
  originPort: number;

  // Step 5: Settings
  argoSmartRouting: boolean;
  tls: 'off' | 'full';
  ipAccessRule: boolean;
  proxyProtocol: 'off' | 'v1' | 'v2';
}

export interface StepProps {
  formData: SpectrumFormData;
  onUpdate: (data: Partial<SpectrumFormData>) => void;
  onNext: () => void;
  onBack: () => void;
}
