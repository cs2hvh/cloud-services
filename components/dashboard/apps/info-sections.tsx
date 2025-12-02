'use client';

import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const FRAMEWORKS = [
  { name: 'Next.js', icon: '/next.svg' },
  { name: 'React', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg' },
  { name: 'Vue.js', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/vuejs/vuejs-original.svg' },
  { name: 'Node.js', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nodejs/nodejs-original.svg' },
  { name: 'Express.js', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/express/express-original.svg' },
  { name: 'Python', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg' },
  { name: 'Django', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/django/django-plain.svg' },
  { name: 'Flask', icon: 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/flask/flask-original.svg' },
];

const GIT_PROVIDERS = [
  {
    name: 'GitHub',
    icon: '/github.png',
    description: 'Deploy directly from your GitHub repositories with automatic builds on every push.',
    features: [
      'Public and private repositories',
      'Branch-based deployments',
      'Pull request previews',
      'Automatic SSL certificates',
    ],
  },
  {
    name: 'GitLab',
    icon: '/gitlab.png',
    description: 'Seamless integration with GitLab repositories and CI/CD pipelines.',
    features: [
      'GitLab.com and self-hosted',
      'CI/CD pipeline integration',
      'Merge request deployments',
      'Environment variables',
    ],
  },
  {
    name: 'Bitbucket',
    icon: '/BitBucket.png',
    description: 'Deploy from Bitbucket repositories with support for Bitbucket Pipelines.',
    features: [
      'Bitbucket Cloud integration',
      'Pipeline-based deployments',
      'Branch protection rules',
      'Team collaboration features',
    ],
  },
];

const STEPS = [
  {
    number: 1,
    title: 'Connect Repository',
    description: 'Connect your GitHub, GitLab, or Bitbucket repository to our platform',
    color: 'blue',
  },
  {
    number: 2,
    title: 'Configure Build',
    description: 'Set up build settings, environment variables, and deployment configuration',
    color: 'green',
  },
  {
    number: 3,
    title: 'Automatic Deploy',
    description: 'Every push triggers an automatic build and deployment to production',
    color: 'purple',
  },
  {
    number: 4,
    title: 'Scale & Monitor',
    description: 'Monitor performance, scale automatically, and manage your live application',
    color: 'orange',
  },
];

export function SupportedFrameworks() {
  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-white mb-6">Supported Frameworks & Languages</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {FRAMEWORKS.map((framework) => (
          <Card key={framework.name} className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-4">
              <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center">
                <Image
                  src={framework.icon}
                  alt={framework.name}
                  width={48}
                  height={48}
                  className="object-contain"
                />
              </div>
              <p className="text-sm font-medium text-white">{framework.name}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function GitProviders() {
  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-white mb-6">Supported Git Providers</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {GIT_PROVIDERS.map((provider) => (
          <Card key={provider.name} className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Image src={provider.icon} alt={provider.name} width={20} height={20} className="mr-2" />
                {provider.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-white/60">{provider.description}</CardDescription>
              <ul className="mt-4 space-y-2 text-sm text-white/70">
                {provider.features.map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function HowItWorks() {
  const colorClasses: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-400' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-400' },
  };

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-white mb-6">How Application Deployment Works</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {STEPS.map((step) => (
          <Card key={step.number} className="bg-white/5 border-white/10 text-center">
            <CardContent className="p-6">
              <div
                className={`w-12 h-12 ${colorClasses[step.color].bg} rounded-lg flex items-center justify-center mx-auto mb-4`}
              >
                <span className={`text-2xl font-bold ${colorClasses[step.color].text}`}>
                  {step.number}
                </span>
              </div>
              <h3 className="font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-sm text-white/60">{step.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
