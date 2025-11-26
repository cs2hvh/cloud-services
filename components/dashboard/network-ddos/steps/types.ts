

export interface SpectrumFormData {
  // Step 0: User (admin only)
  selectedUser?: string;

  // Step 1: App Type
  appType: 'tcp' | 'udp' | 'ssh' | 'rdp' | '';

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
  proxyProtocol: 'off' | 'v1' | 'v2' | 'simple';
  
  // Additional fields for new schema
  edgeIpType: string;
  edgeIpConnectivity: string;
  trafficType: string;

  // Step 6: Project
  project_id: string;
}

export interface StepProps {
  formData: SpectrumFormData;
  onUpdate: (data: Partial<SpectrumFormData>) => void;
  onNext: () => void;
  onBack: () => void;
  spectrumApps?: string[];
}
