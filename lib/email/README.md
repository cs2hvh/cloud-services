# Email Service

`lib/email/` is the modular email layer for the platform.

Structure:

- `config.ts`: resolves sender address, reply-to, support URL, and branding defaults.
- `service.ts`: builds and sends typed email messages through Resend.
- `types.ts`: central template/data contracts for all email types.
- `templates/`: reusable email templates grouped by domain (`auth`, `billing`, `deployments`, `alerts`).
- `components/`: shared React Email layout primitives used by templates.
- `logger.ts`: isolated logging for email delivery events and failures.

How to add a new email:

1. Add a data contract to `types.ts`.
2. Create a template in `templates/<domain>/`.
3. Register it in `templates/index.tsx`.
4. Call `emailService.sendTemplate({ template, to, data })` from the feature module.

Example templates included:

- `otp`
- `forgotPassword`
- `accountCreated`
- `emailVerification`
- `newLoginAlert`
- `apiKeyActivity`
- `suspiciousActivity`
- `billingNotification`
- `deploymentStatus`
- `systemAlert`
