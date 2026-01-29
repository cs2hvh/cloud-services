# Application Deployment Platform

## Service Synopsis Document

**Document Version:** 1.0  
**Last Updated:** January 2026  
**Service Status:** Production

---

## 1. Overview & Purpose

### 1.1 Introduction

The Application Deployment Platform is a fully managed cloud service that enables users to deploy web applications directly from their source code. Instead of manually configuring servers, installing software, and managing infrastructure, users simply connect their code repository and click deploy. The platform takes care of everything else automatically.

This service is designed for developers, startups, agencies, and businesses who want to launch applications quickly without hiring dedicated DevOps engineers or managing complex server infrastructure.

### 1.2 What Does This Platform Do?

In simple terms, this platform transforms your application code into a live, publicly accessible website or web application. Here's what happens when you use it:

- **You provide the code** — Connect your GitHub, GitLab, or Bitbucket repository where your application code is stored.

- **We build it** — The platform automatically detects your programming framework (like Next.js, React, Python, etc.) and builds your application into a deployable package called a container.

- **We deploy it** — Your application is deployed to our cloud servers running on Kubernetes, a powerful system that manages and scales applications automatically.

- **We secure it** — Every application receives a free SSL certificate, meaning your site works over HTTPS and is secure by default.

- **We give you a URL** — Your application is immediately accessible via a subdomain like `yourapp.galaxyhvh.com`, or you can connect your own custom domain.

### 1.3 Why Use This Platform?

**The Traditional Way (Without This Platform):**

Setting up a web application traditionally requires significant effort. You need to rent a server from a cloud provider, install an operating system, configure web server software, set up security rules, obtain SSL certificates, configure DNS, and then manually deploy your code. Every time you update your code, you need to repeat parts of this process. This typically requires a dedicated DevOps engineer and can take days or weeks.

**Our Way (With This Platform):**

With our platform, you skip all of that complexity. Connect your repository, choose your settings, and click deploy. Your application is live in 3-5 minutes. When you push new code to your repository, it automatically redeploys. No server management, no manual configuration, no DevOps expertise needed.

### 1.4 Key Benefits

1. **Speed** — Deploy applications in minutes instead of days. No server setup required.

2. **Simplicity** — No DevOps knowledge needed. If you can push code to GitHub, you can deploy on our platform.

3. **Automatic SSL** — Every application gets free HTTPS encryption automatically. No certificate purchases or manual installation.

4. **Continuous Deployment** — Enable auto-deploy and your application updates automatically every time you push code to your repository.

5. **Scalability** — Start small and scale up as your application grows. Upgrade resources with one click.

6. **Cost Efficiency** — Pay only for what you use with hourly billing. No upfront costs or long-term commitments.

7. **Reliability** — Applications run on Kubernetes, the industry-standard platform used by companies like Google, Spotify, and Airbnb for managing applications at scale.

---

## 2. Services & Modules

### 2.1 Platform Overview

The Application Deployment Platform is composed of several integrated services that work together to provide a seamless deployment experience. Each service handles a specific part of the deployment process, from receiving your code to making your application available on the internet.

### 2.2 Core Services

#### Deployment Engine

The Deployment Engine is the central coordinator of the entire platform. When you click "Deploy," this service takes over and orchestrates the entire process. It allocates resources for your application, creates records in our database to track your deployment, coordinates with other services to set up DNS and SSL, and monitors the build process until completion.

The Deployment Engine ensures that every step happens in the correct order and handles any errors that might occur along the way. If something fails, it automatically cleans up partial resources so you can try again without issues.

#### DNS Service

The DNS Service manages domain names for your applications. DNS (Domain Name System) is what allows people to visit `yourapp.galaxyhvh.com` instead of remembering a numerical IP address like `143.198.174.204`.

When you deploy an application, the DNS Service automatically creates a subdomain for you. If your application is named "my-blog," you'll get `my-blog.galaxyhvh.com` pointing to your application. This happens within seconds, so your application is accessible almost immediately after deployment completes.

The DNS Service also supports custom domains. If you own `mybusiness.com`, you can configure it to point to your deployed application, and we'll automatically provision an SSL certificate for it.

#### CI/CD Pipeline Service

CI/CD stands for Continuous Integration and Continuous Deployment. This service handles the actual building and deployment of your application code.

When a deployment is triggered, the CI/CD service:

1. **Clones your repository** — Downloads your code from GitHub, GitLab, or Bitbucket.

2. **Detects your framework** — Automatically identifies whether you're using Next.js, React, Express, Python, or another supported framework.

3. **Builds your application** — Compiles your code and packages it into a Docker container, which is a standardized format for running applications.

4. **Pushes to registry** — Stores your built application in a container registry (Docker Hub) so it can be deployed to servers.

5. **Deploys to Kubernetes** — Creates the necessary resources in our Kubernetes cluster to run your application.

This entire process is automated and typically completes in 3-5 minutes for most applications.

#### SSL Certificate Service

Security is not optional in modern web applications. The SSL Certificate Service ensures that every application deployed on our platform is secured with HTTPS encryption.

We use cert-manager with Let's Encrypt integration to automatically issue SSL certificates. The certificate provisioning happens automatically during deployment—you don't need to request certificates, configure them, or worry about renewals. When your certificate is about to expire, our system automatically renews it.

This means every application you deploy will have the green padlock icon in browsers, and your users' data is encrypted in transit.

#### Monitoring Service

The Monitoring Service collects and displays performance metrics for your applications. You can see:

- **CPU Usage** — How much processing power your application is consuming.
- **Memory Usage** — How much RAM your application is using.
- **Request Metrics** — How many requests your application is receiving.

These metrics help you understand whether your application needs more resources or if there are performance issues that need attention.

#### Logging Service

The Logging Service provides access to your application's runtime logs. Logs are essential for debugging issues and understanding what your application is doing.

You can view logs in real-time through the dashboard, which is particularly useful when deploying new code or debugging issues. Logs are retained for 30 days, giving you time to investigate any problems that occurred in the past.

### 2.3 Supporting Services

Beyond the core services, several supporting services enhance the platform's capabilities:

- **Auto-Deploy Service** — Listens for webhook notifications from GitHub, GitLab, or Bitbucket. When you push code to your configured branch, this service automatically triggers a new deployment.

- **Webhook Manager** — Handles the registration and management of webhooks with your Git providers. When you enable auto-deploy, this service sets up the necessary webhook so your Git provider knows to notify us when code changes.

- **Custom Domain Service** — Manages the configuration of custom domains. When you add a custom domain like `www.mybusiness.com`, this service verifies ownership, configures DNS records, and provisions SSL certificates.

- **Health Monitor** — Continuously checks whether your application is running and healthy. If an application crashes, Kubernetes automatically restarts it. The Health Monitor tracks this and displays the status in your dashboard.

- **Infrastructure Cleanup Service** — When you delete an application, this service ensures all associated resources are properly removed—DNS records, Kubernetes resources, database entries, and SSL certificates.

### 2.4 Supported Frameworks

The platform supports a wide range of popular web development frameworks. For each supported framework, the platform can automatically generate the necessary build configuration if you don't provide one.

**JavaScript and Node.js:**
- Next.js — The popular React framework for production
- Express.js — Minimalist Node.js web framework
- Nuxt.js — Vue.js framework for server-side rendering
- SvelteKit — Svelte's application framework
- Node.js — Generic Node.js applications

**Frontend Frameworks:**
- React (with Vite) — Facebook's UI library
- Vue.js — Progressive JavaScript framework
- Angular — Google's application framework

**Python:**
- Flask — Lightweight Python framework
- FastAPI — Modern, fast Python framework for APIs

**Custom Applications:**
If your application uses a framework not listed above, or has unique requirements, you can provide your own Dockerfile. The platform will use your custom build instructions instead of auto-generating them.

---

## 3. Authentication & Login Schema

### 3.1 How Users Access the Platform

The platform uses Supabase Authentication, a secure and modern authentication system, to manage user accounts and sessions. This ensures that your account is protected and only you can access your applications and settings.

### 3.2 Login Methods

We offer multiple ways to sign in to accommodate different user preferences:

**Email and Password:**
The traditional method where you register with your email address and create a password. After registration, you'll receive a verification email to confirm your account. This method is straightforward and doesn't require any third-party accounts.

**GitHub Sign-In:**
Click "Sign in with GitHub" and you'll be redirected to GitHub to authorize access. Once authorized, you're automatically signed in. This is convenient if you already have a GitHub account, which most developers do.

**GitLab Sign-In:**
Similar to GitHub, you can sign in using your GitLab account. This is particularly useful if your organization uses GitLab for source control.

**Google Sign-In:**
Use your Google account for quick access. This is helpful if you prefer keeping your work accounts separate from your code hosting accounts.

**Bitbucket Sign-In:**
For teams using Atlassian's Bitbucket for source control, you can sign in directly with your Bitbucket account.

### 3.3 Two-Factor Authentication

For additional security, you can enable two-factor authentication (2FA) on your account. When enabled, you'll need to enter a code from an authenticator app (like Google Authenticator or Authy) in addition to your password when signing in.

We strongly recommend enabling 2FA, especially if you're deploying production applications or working with sensitive data.

### 3.4 Session Security

When you sign in, the platform creates a secure session using JWT (JSON Web Tokens). Here's how we keep your session secure:

- **Secure Cookies** — Your session token is stored in an HTTP-only cookie, which prevents malicious scripts from accessing it.

- **Short Expiry** — Sessions expire after a reasonable period, requiring you to sign in again periodically.

- **Automatic Refresh** — To avoid interrupting your work, sessions are silently refreshed while you're active.

- **Single Logout** — When you sign out, all session data is cleared from your browser.

### 3.5 Connecting Git Providers

To deploy applications from your repositories, you need to authorize the platform to access your code. This is separate from signing in—it's about giving the platform permission to read your repositories.

**How it works:**

1. Go to the deployment page and select your Git provider (GitHub, GitLab, or Bitbucket).

2. You'll be redirected to your provider's authorization page.

3. Review the permissions requested (typically read-only access to repositories).

4. Authorize the connection.

5. You're redirected back to the platform, and your repositories are now available for deployment.

**Important notes about security:**

- We only request the minimum permissions needed to clone your repositories.
- Your access tokens are encrypted when stored in our database.
- You can revoke access at any time from your Git provider's settings.
- We never store your actual code—we only clone it temporarily during builds.

---

## 4. Upgrade & Plan Schema

### 4.1 Understanding Plans

The platform offers three resource tiers to accommodate different application needs. Each plan determines how much computing power, memory, and storage your application receives.

### 4.2 Available Plans

**Small Plan:**
Designed for personal projects, prototypes, and testing. This plan provides 0.5 vCPU, 512 MB of RAM, and 10 GB of storage. It's suitable for low-traffic applications, portfolios, blogs, and applications in development.

The Small plan uses shared CPU resources, meaning your application shares processing power with other applications. This keeps costs low but may result in variable performance during high-demand periods.

**Medium Plan:**
Intended for production applications with moderate traffic. This plan provides 1 full vCPU, 1 GB of RAM, and 20 GB of storage. The CPU is dedicated, meaning your application has consistent access to its allocated processing power.

This plan is suitable for business applications, SaaS products, e-commerce sites, and applications with regular traffic.

**Large Plan:**
Built for high-traffic applications requiring maximum resources. This plan provides 2 vCPU, 2 GB of RAM, and 40 GB of storage. All resources are dedicated for consistent, reliable performance.

This plan is suitable for popular applications, high-traffic APIs, applications with complex processing requirements, and business-critical systems.

### 4.3 Plan Comparison

| Feature | Small | Medium | Large |
|:--------|:------|:-------|:------|
| CPU | 0.5 vCPU (shared) | 1 vCPU (dedicated) | 2 vCPU (dedicated) |
| Memory | 512 MB | 1 GB | 2 GB |
| Storage | 10 GB | 20 GB | 40 GB |
| Bandwidth | Unmetered | Unmetered | Unmetered |
| SSL Certificate | Included | Included | Included |
| Custom Domains | Unlimited | Unlimited | Unlimited |
| Best For | Testing, portfolios | Production apps | High-traffic apps |

### 4.4 How Billing Works

**Hourly Billing:**
You're charged based on how long your application runs. If you deploy an application on the Professional plan and it runs for 100 hours, you pay for 100 hours of Professional plan usage. There are no charges when your application is stopped.

**Credit System:**
The platform uses a prepaid credit system. You add credits to your account, and usage is deducted hourly. This gives you full control over your spending—you decide how much to add, and you can monitor your balance in the dashboard.

**Low Balance Alerts:**
When your credit balance drops to 20%, you'll receive a notification. This gives you time to add more credits before your applications are affected.

**Auto-Suspension:**
If your credit balance reaches zero, your applications are automatically suspended (not deleted). They stop running and stop incurring charges. Once you add more credits, you can resume your applications with a single click. Your data and configuration are preserved for 7 days.

### 4.5 Upgrading and Downgrading

**To upgrade your application:**

1. Open your application's settings in the dashboard.
2. Navigate to the Resources or Plan section.
3. Select the new plan you want (Small, Medium, or Large).
4. Confirm the change.

The platform will update your application's resources. This typically requires a brief restart (a few seconds), after which your application runs with the new resources. The new billing rate applies immediately.

**To downgrade:**

The process is the same as upgrading. However, be aware that if your application is using more storage than the lower plan allows, you'll need to reduce your storage usage first.

There are no penalties or waiting periods for changing plans. You can adjust resources as often as needed based on your application's requirements.

---

## 5. Technology Stack

### 5.1 Overview

The platform is built using modern, industry-standard technologies. This section provides transparency about what powers the platform and may be useful for technical evaluation, integration planning, or compliance requirements.

### 5.2 User Interface

The dashboard and management interface are built with:

- **Next.js 15** — A React-based framework that provides excellent performance and developer experience. We use the latest version with the App Router for modern React patterns.

- **TypeScript** — All our frontend code is written in TypeScript, which helps prevent bugs and makes the codebase more maintainable.

- **Tailwind CSS** — A utility-first CSS framework that allows for consistent, responsive design across all pages.

- **Shadcn/UI** — A collection of well-designed, accessible UI components that provide a consistent user experience.

### 5.3 Backend Services

The API and backend logic are powered by:

- **Node.js** — The JavaScript runtime that powers our backend services. We use the latest LTS version for stability and security.

- **Next.js API Routes** — Our REST APIs are implemented using Next.js API routes, allowing us to maintain a unified codebase.

- **Supabase** — Provides our database (PostgreSQL), authentication, and real-time capabilities. Supabase is an open-source alternative to Firebase with better SQL support.

- **PostgreSQL** — Our primary database, known for reliability, data integrity, and excellent performance.

### 5.4 Deployment Infrastructure

User applications are deployed using:

- **Kubernetes** — The industry-standard container orchestration platform. Kubernetes manages the deployment, scaling, and operation of application containers across clusters of hosts.

- **Docker** — All applications are packaged as Docker containers, ensuring consistency between development and production environments.

- **Jenkins** — Handles our CI/CD pipelines, automating the build and deployment process.

- **NGINX Ingress** — Manages incoming traffic to applications, handles load balancing, and terminates SSL connections.

- **cert-manager** — Automatically provisions and renews SSL certificates using Let's Encrypt as the certificate authority.

### 5.5 External Services

We integrate with these third-party services:

- **Cloudflare** — Provides DNS management and DDoS protection. All DNS records for deployed applications are managed through Cloudflare's API.

- **Docker Hub** — Stores built container images for deployment to Kubernetes.

- **GitHub, GitLab, Bitbucket** — Integrated as source code providers for application deployments.

### 5.6 Monitoring

- **Prometheus** — Collects and stores metrics from all deployed applications, enabling the metrics dashboards you see in the platform.

---

## 6. Security & Access Control

### 6.1 Our Security Commitment

Security is fundamental to the platform's design. We implement multiple layers of protection to ensure your applications, data, and credentials are secure.

### 6.2 Data Encryption

**In Transit:**
All data transmitted to and from the platform is encrypted using TLS 1.3, the latest and most secure version of the Transport Layer Security protocol. This applies to:
- Your interactions with the dashboard
- API calls
- Communication between internal services
- Your deployed applications (all get HTTPS)

**At Rest:**
Sensitive data stored in our databases is encrypted using AES-256 encryption. This includes:
- Your OAuth tokens for Git providers
- Environment variables for your applications
- Any credentials or secrets

### 6.3 Authentication Security

**Password Protection:**
User passwords are never stored in plain text. We use bcrypt hashing with salt, which is an industry-standard approach that makes it extremely difficult for passwords to be compromised even if database contents were exposed.

**Session Security:**
Authentication sessions use JWT tokens stored in HTTP-only, secure cookies. These cookies:
- Cannot be accessed by JavaScript (preventing XSS attacks)
- Are only sent over HTTPS
- Have the SameSite attribute set to prevent CSRF attacks

**Rate Limiting:**
To prevent brute-force attacks and abuse, the platform implements rate limiting:
- 30 requests per minute for normal API usage
- Automatic blocking with a 5-minute cooldown when limits are exceeded
- Stricter limits on authentication endpoints

### 6.4 Access Control

**Role-Based Access:**
The platform implements role-based access control (RBAC) to ensure users can only access what they're authorized to:

- **Platform Admin** — Full access to the entire platform, including user management and system configuration. Reserved for platform operators.

- **Account Owner** — Full control over their own account, applications, and billing. Can invite team members and manage access.

- **Team Member** — Can deploy and manage applications they've been granted access to. Cannot access billing or invite others.

- **Viewer** — Read-only access to application status, logs, and metrics. Cannot make changes.

**Row-Level Security:**
Our database implements row-level security (RLS), which means users can only query data that belongs to them. Even if there were a bug in our API code, the database itself enforces access restrictions.

### 6.5 Application Isolation

**Container Isolation:**
Each deployed application runs in its own container with:
- Separate filesystem
- Separate network namespace
- Limited system capabilities (non-root execution)
- Resource limits (cannot consume more than allocated)

**Kubernetes Namespaces:**
Applications are further isolated using Kubernetes namespaces, providing an additional layer of separation between different users' workloads.

### 6.6 Code and Secrets Security

**Source Code:**
Your source code is never permanently stored on our platform. During deployment, code is:
1. Cloned from your Git provider
2. Built into a container image
3. Deleted from the build server

The container image contains the compiled/built application, not your raw source code.

**Environment Variables:**
Application secrets and configuration stored as environment variables are:
- Encrypted in the database
- Only decrypted when injected into running containers
- Masked in logs (never displayed in plain text)
- Accessible only to your application at runtime

### 6.7 Audit and Compliance

**Audit Logging:**
Administrative actions are logged for accountability:
- Application deployments and deletions
- Configuration changes
- Team member additions and removals
- Billing changes

**Security Practices:**
- Regular dependency updates and security patches
- Container image vulnerability scanning
- Infrastructure access restricted and audited
- Incident response procedures documented

---

## 7. Target Audience

### 7.1 Who Is This Platform For?

The Application Deployment Platform is designed for anyone who needs to deploy web applications but wants to avoid the complexity of traditional server management. Here are the primary user groups:

### 7.2 Individual Developers

**Profile:** Freelancers, hobbyists, students, and solo developers working on personal projects.

**Common Use Cases:**
- Deploying portfolio websites to showcase work
- Hosting side projects and experiments
- Running personal blogs or documentation sites
- Learning and practicing deployment workflows

**Why the platform fits:** Low barrier to entry, affordable pricing, and no need to learn complex DevOps tools. Deploy projects in minutes and focus on coding instead of infrastructure.

### 7.3 Startup Teams

**Profile:** Early-stage companies with small engineering teams (typically 2-20 developers) who need to move fast and stay lean.

**Common Use Cases:**
- Launching MVPs (Minimum Viable Products) quickly
- Iterating on products based on user feedback
- Running production applications without dedicated DevOps
- Scaling applications as user base grows

**Why the platform fits:** Fast deployment enables quick iteration. The team can focus on building product features rather than managing infrastructure. Easy scaling supports growth without re-architecting.

### 7.4 Digital Agencies

**Profile:** Web development agencies managing applications for multiple clients.

**Common Use Cases:**
- Deploying and managing client projects
- Maintaining multiple applications efficiently
- Providing reliable hosting as part of service packages
- Standardizing deployment workflows across projects

**Why the platform fits:** Consistent deployment process across all projects. Easy to hand off applications to clients if needed. Clear billing per application simplifies client invoicing.

### 7.5 Small and Medium Businesses

**Profile:** Companies without dedicated DevOps or infrastructure teams who need reliable application hosting.

**Common Use Cases:**
- Running customer-facing web applications
- Deploying internal tools and dashboards
- Hosting API services for mobile apps or integrations
- Managing business-critical applications

**Why the platform fits:** Enterprise-grade infrastructure without enterprise complexity. Reliable platform with good uptime. No need to hire specialized infrastructure engineers.

### 7.6 Technical Requirements for Users

To use the platform effectively, users should have:

**Minimum:**
- Basic understanding of Git (clone, commit, push)
- Ability to write code in a supported language/framework
- Access to a GitHub, GitLab, or Bitbucket account

**Helpful but not required:**
- Familiarity with environment variables and configuration
- Understanding of web application concepts (ports, domains, HTTPS)
- Experience with command-line interfaces

**Not required:**
- Server administration knowledge
- DevOps or infrastructure experience
- Knowledge of Docker, Kubernetes, or CI/CD systems

---

## 8. Deployment Workflow

### 8.1 Overview

This section explains exactly what happens when you deploy an application, from start to finish. Understanding this workflow helps you troubleshoot issues and make the most of the platform.

### 8.2 Before You Deploy

Before starting a deployment, ensure you have:

1. **A Git repository** with your application code, hosted on GitHub, GitLab, or Bitbucket.

2. **A connected Git account** — authorize the platform to access your repositories (one-time setup).

3. **A working application** — your code should run successfully locally. The platform builds and deploys your code but doesn't fix bugs.

4. **Platform credits** — ensure your account has sufficient balance for the deployment.

### 8.3 The Deployment Process

**Step 1: Select Your Repository**

From the dashboard, click "Deploy New Application" and select your Git provider. Choose the repository containing your application and select the branch you want to deploy (usually `main` or `master`).

The platform fetches your repository metadata and branch list directly from your Git provider using the access token you authorized earlier.

**Step 2: Configure Your Application**

Provide the following information:

- **Application Name** — A unique name for your application. This becomes part of your URL (e.g., `my-app.galaxyhvh.com`). Use lowercase letters, numbers, and hyphens only.

- **Framework** — Select your application's framework, or let the platform auto-detect it based on your repository contents.

- **Plan** — Choose the resource tier (Starter, Professional, or Business) based on your expected traffic and performance needs.

- **Environment Variables** (optional) — Add any secrets or configuration your application needs, such as API keys, database URLs, or feature flags.

**Step 3: Deploy**

Click the Deploy button. Here's what happens behind the scenes:

1. **Database Record Created** — The platform creates a record for your application, generating a unique identifier and slug.

2. **DNS Record Created** — A DNS entry is created so your application will be accessible at `your-app-name.galaxyhvh.com`. This typically propagates within seconds.

3. **Build Triggered** — The CI/CD system begins building your application:
   - Your code is cloned from the Git repository
   - Dependencies are installed (npm install, pip install, etc.)
   - Your application is built (if applicable)
   - A Docker image is created containing your application
   - The image is pushed to the container registry

4. **Kubernetes Deployment** — Once the image is ready:
   - A Deployment resource is created in Kubernetes
   - A Service resource exposes your application internally
   - An Ingress resource routes external traffic to your application
   - A certificate request is made for SSL

5. **SSL Certificate Issued** — cert-manager requests a certificate from Let's Encrypt, validates domain ownership, and installs the certificate.

6. **Application Live** — Your application is now running and accessible via HTTPS at your assigned URL.

This entire process typically takes 3-5 minutes for most applications.

### 8.4 Monitoring Your Deployment

During deployment, you can watch progress in real-time:

- **Status Updates** — The dashboard shows the current deployment stage (pending → building → deploying → running).

- **Build Logs** — View live output from the build process, including dependency installation and compilation in a dedicated Build Logs tab.

- **Error Information** — If something goes wrong, error messages and logs help identify the issue.

### 8.5 Application Management Dashboard

Once deployed, each application has a comprehensive management interface with multiple tabs:

**Overview Tab:**
- Real-time health status and pod information
- CPU and memory usage with visual progress indicators
- Pod count, restart count, and uptime metrics
- Network details (Ingress host, TLS status, service information)
- Resource allocations for your current plan

**Integrations Tab:**
- **Database Integration** — Link PostgreSQL or MySQL databases to your application. The platform automatically injects connection strings as environment variables (DATABASE_URL, DATABASE_HOST, etc.)
- **Object Storage Integration** — Connect S3-compatible storage buckets. Credentials are automatically provided as environment variables (S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET)
- Automatic redeployment after linking integrations to inject credentials

**Domains Tab:**
- Manage custom domains for your application
- Add, verify, and activate custom domains with automatic SSL provisioning
- Set primary domain for your application

**Build Logs Tab:**
- View complete build logs from your latest deployment
- Track dependency installation, compilation, and Docker image creation
- Debug build failures with detailed error messages

**Runtime Logs Tab:**
- Live streaming logs from your running application
- Filter and search through application output
- Troubleshoot runtime issues and monitor application behavior

**Issues Tab:**
- Intelligent issue detection and reporting
- Platform translates complex Kubernetes events into user-friendly messages:
  - "Application crashed on startup" (from CrashLoopBackOff)
  - "Application exceeded memory limit" (from OOMKilled)
  - "Deployment failed to start" (from ImagePullBackOff)
  - "Health check failed" (from Liveness/Readiness probe failures)
- Actionable recommendations for resolving issues
- Automatic filtering of resolved/stale issues

**Deployments Tab:**
- Complete deployment history with build numbers
- Each deployment shows:
  - Status (Success/Failure) with duration
  - Git commit SHA and commit message
  - Deployment trigger (manual/webhook/rollback/resize)
  - Detailed failure reasons for failed deployments
  - Timestamps for tracking deployment frequency

**Settings Tab:**
- **Environment Variables** — Add, edit, or remove environment variables with live updates (automatic redeployment)
- **Resource Management** — Resize your application (upgrade or downgrade between Small/Medium/Large plans) without deleting
- **Danger Zone** — Delete application with full cleanup of all resources

### 8.6 After Deployment

Once your application is running:

- **Access Your App** — Click the URL in your dashboard to visit your live application.

- **View Logs** — Check runtime logs in the Runtime Logs tab to ensure your application is functioning correctly.

- **Monitor Metrics** — Watch real-time CPU and memory usage in the Overview tab to ensure your chosen plan is adequate.

- **Review Issues** — The Issues tab automatically detects and reports problems, translating technical Kubernetes events into actionable insights.

- **Configure Custom Domain** (optional) — Add your own domain name in the Domains tab with automatic SSL.

- **Link Integrations** (optional) — Connect databases or object storage buckets in the Integrations tab.

- **Enable Auto-Deploy** (optional) — Turn on automatic deployments so future code pushes deploy automatically.

### 8.7 Updating Your Application

**Manual Redeployment:**
Click the "Redeploy" button in your dashboard to trigger a new deployment with the latest code from your repository.

**Automatic Deployment:**
Enable auto-deploy in your application settings. When you push code to your configured branch, a webhook notification triggers automatic redeployment. Your application updates within minutes of pushing code.

**Environment Variables Update:**
Changes to environment variables trigger an automatic redeployment to inject the new values into your application.

**Integration Changes:**
Linking or unlinking databases and storage buckets automatically triggers redeployment with updated credentials.

### 8.8 Resource Management

**Resizing Applications:**
Change your application's resources without deleting and recreating:

1. Go to Settings tab
2. Select new plan size (Small/Medium/Large)
3. Confirm the change
4. Platform updates Kubernetes deployment with new resource limits
5. Brief restart (a few seconds) applies new resources
6. Billing automatically updates to new rate

This resize operation is faster than full redeployment since it doesn't rebuild your application.

### 8.9 Rolling Back

If a new deployment introduces problems, you can quickly return to a previous version:

1. Open your application's Deployments tab
2. Find the previous working deployment in the history
3. Click "Rollback" next to that deployment
4. Confirm the rollback

The platform redeploys the previous Docker image, typically completing within 30 seconds. Your application returns to the previous version without needing to rebuild.

---

## 9. Appendix

### 9.1 API Endpoints Reference

The platform provides a REST API for programmatic access. All endpoints require authentication.

**Application Management:**
- `POST /api/services/platform-apps/create` — Deploy a new application
- `GET /api/services/platform-apps/list` — List all your applications
- `POST /api/services/platform-apps/get` — Get details of a specific application
- `POST /api/services/platform-apps/delete` — Delete an application
- `POST /api/services/platform-apps/redeploy` — Trigger redeployment
- `POST /api/services/platform-apps/resize` — Change application plan
- `POST /api/services/platform-apps/rollback` — Rollback to previous version

**Monitoring:**
- `GET /api/services/platform-apps/runtime-logs` — Fetch application runtime logs
- `GET /api/services/platform-apps/logs` — Fetch build logs
- `GET /api/services/platform-apps/metrics` — Get CPU and memory metrics
- `GET /api/services/platform-apps/health` — Check application health status
- `GET /api/services/platform-apps/pods` — Get pod information and status
- `GET /api/services/platform-apps/events` — Get translated application issues

**Configuration:**
- `POST /api/services/platform-apps/env-vars/update` — Update environment variables
- `POST /api/services/platform-apps/domains/add` — Add custom domain
- `POST /api/services/platform-apps/domains/verify` — Verify custom domain ownership
- `POST /api/services/platform-apps/domains/activate` — Activate custom domain with SSL
- `POST /api/services/platform-apps/domains/set-primary` — Set primary domain
- `POST /api/services/platform-apps/domains/remove` — Remove custom domain
- `GET /api/services/platform-apps/deployments` — Get deployment history

**Integrations:**
- `POST /api/services/platform-apps/integrations/link` — Link database to application
- `POST /api/services/platform-apps/integrations/unlink` — Unlink database from application
- `GET /api/services/platform-apps/integrations/linked` — List linked databases
- `POST /api/services/platform-apps/integrations/storage/link` — Link object storage bucket
- `POST /api/services/platform-apps/integrations/storage/unlink` — Unlink storage bucket
- `GET /api/services/platform-apps/integrations/storage/linked` — List linked storage buckets

### 9.2 Glossary of Terms

**API (Application Programming Interface):** A way for different software systems to communicate with each other. When your frontend calls your backend, it's using an API.

**CI/CD (Continuous Integration/Continuous Deployment):** The practice of automatically building and deploying code changes. Our platform handles CI/CD so you don't have to set it up yourself.

**Container:** A lightweight, standalone package that includes everything needed to run an application—code, runtime, libraries, and settings. Containers ensure your application runs the same way everywhere.

**DNS (Domain Name System):** The system that translates human-readable domain names (like `example.com`) into IP addresses that computers use. When you deploy an app, we create DNS records so people can access it by name.

**Docker:** A platform for developing, shipping, and running applications in containers. We use Docker to package your application for deployment.

**Environment Variable:** A configuration value passed to your application at runtime. Used for secrets (API keys), settings (database URLs), and feature flags without hardcoding them.

**Ingress:** In Kubernetes, the component that manages external access to services. It handles routing HTTP/HTTPS traffic to the correct application.

**JWT (JSON Web Token):** A secure way to transmit information between parties as a JSON object. We use JWTs for authentication sessions.

**Kubernetes:** An open-source platform for automating deployment, scaling, and management of containerized applications. Your applications run on Kubernetes.

**OAuth:** A standard protocol for authorization. When you "Sign in with GitHub," OAuth is what allows GitHub to securely share your identity with us without sharing your password.

**SSL/TLS:** Security protocols that encrypt data transmitted over the internet. When you see HTTPS and a padlock icon, SSL/TLS is protecting the connection.

**Webhook:** An HTTP callback triggered by an event. When you push code to GitHub and auto-deploy is enabled, GitHub sends a webhook to our platform to start the deployment.

### 9.3 Service Commitments

**Platform Availability:** We target 99.9% uptime for the platform dashboard and API.

**Deployment Time:** Most applications deploy within 10 minutes. Simple applications typically complete in 3-5 minutes.

**Support Response:** Support inquiries receive a response within 4 business hours.

---

## Document History

| Version | Date | Description |
|:--------|:-----|:------------|
| 1.0 | January 2026 | Initial document |

---

*This document provides a comprehensive overview of the Application Deployment Platform. For specific technical questions or support, please contact the platform team.*
