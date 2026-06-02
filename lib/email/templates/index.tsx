import { AccountCreatedEmailTemplate } from "@/lib/email/templates/auth/account-created";
import { ApiKeyActivityEmailTemplate } from "@/lib/email/templates/auth/api-key-activity";
import { EmailVerificationTemplate } from "@/lib/email/templates/auth/email-verification";
import { BillingNotificationEmailTemplate } from "@/lib/email/templates/billing/billing-notification";
import { DeploymentStatusEmailTemplate } from "@/lib/email/templates/deployments/deployment-status";
import { ForgotPasswordEmailTemplate } from "@/lib/email/templates/auth/forgot-password";
import { NewLoginAlertEmailTemplate } from "@/lib/email/templates/auth/new-login-alert";
import { OtpEmailTemplate } from "@/lib/email/templates/auth/otp";
import { SuspiciousActivityEmailTemplate } from "@/lib/email/templates/auth/suspicious-activity";
import { ConsultationRequestEmailTemplate } from "@/lib/email/templates/alerts/consultation-request";
import { SystemAlertEmailTemplate } from "@/lib/email/templates/alerts/system-alert";
import { SupportTicketCreatedEmailTemplate } from "@/lib/email/templates/support/support-ticket-created";
import { SupportTicketReplyEmailTemplate } from "@/lib/email/templates/support/support-ticket-reply";
import { InferenceEventEmailTemplate } from "@/lib/email/templates/inference/inference-event";
import { VpsPasswordResetEmailTemplate } from "@/lib/email/templates/compute/vps-password-reset";
import type { EmailTemplateRegistry } from "@/lib/email/types";

export const emailTemplates: EmailTemplateRegistry = {
  otp: {
    subject: () => "AhuraSense | Your OTP Code",
    previewText: () => "Use this code to complete your registration.",
    render: (data) => <OtpEmailTemplate {...data} />,
    text: ({ username, otp }) =>
      `Hi ${username}, use OTP ${otp} to complete your registration.`,
    tags: () => [{ name: "category", value: "auth" }],
  },
  forgotPassword: {
    subject: () => "AhuraSense | Your Password Reset OTP",
    previewText: () => "Use this code to reset your password.",
    render: (data) => <ForgotPasswordEmailTemplate {...data} />,
    text: ({ username, otp }) =>
      `Hi ${username}, use OTP ${otp} to reset your password.`,
    tags: () => [{ name: "category", value: "auth" }],
  },
  accountCreated: {
    subject: () => "AhuraSense | Your account has been created",
    previewText: () => "Welcome to AhuraSense.",
    render: (data) => <AccountCreatedEmailTemplate {...data} />,
    text: ({ username, email }) =>
      `Hi ${username}, your account for ${email} has been created successfully.`,
    tags: () => [{ name: "category", value: "account-security" }],
  },
  emailVerification: {
    subject: () => "AhuraSense | Verify your email address",
    previewText: () => "Complete your email verification.",
    render: (data) => <EmailVerificationTemplate {...data} />,
    text: ({ username, verificationCode }) =>
      `Hi ${username}, verify your email${verificationCode ? ` with code ${verificationCode}` : ""}.`,
    tags: () => [{ name: "category", value: "account-security" }],
  },
  newLoginAlert: {
    subject: ({ location }) => `AhuraSense | New login detected from ${location}`,
    previewText: () => "We noticed a new login on your account.",
    render: (data) => <NewLoginAlertEmailTemplate {...data} />,
    text: ({ username, device, location, loggedInAt }) =>
      `Hi ${username}, a new login was detected from ${device} in ${location} at ${loggedInAt}.`,
    tags: () => [{ name: "category", value: "account-security" }],
  },
  apiKeyActivity: {
    subject: ({ action, keyName }) =>
      `AhuraSense | API key ${action}: ${keyName}`,
    previewText: () => "An API key activity was recorded.",
    render: (data) => <ApiKeyActivityEmailTemplate {...data} />,
    text: ({ username, keyName, action }) =>
      `Hi ${username}, API key "${keyName}" was ${action}.`,
    tags: ({ action }) => [
      { name: "category", value: "account-security" },
      { name: "action", value: action },
    ],
  },
  suspiciousActivity: {
    subject: () => "AhuraSense | Suspicious activity detected",
    previewText: () => "We detected suspicious account activity.",
    render: (data) => <SuspiciousActivityEmailTemplate {...data} />,
    text: ({ username, activity, detectedAt }) =>
      `Hi ${username}, suspicious activity was detected: ${activity} at ${detectedAt}.`,
    tags: () => [{ name: "category", value: "account-security" }],
  },
  billingNotification: {
    subject: ({ invoiceNumber, status }) =>
      `AhuraSense | Billing ${status} for invoice ${invoiceNumber}`,
    previewText: ({ invoiceNumber }) =>
      `Billing update available for invoice ${invoiceNumber}.`,
    render: (data) => <BillingNotificationEmailTemplate {...data} />,
    text: ({ customerName, invoiceNumber, amount, dueDate, status }) =>
      `Hi ${customerName}, invoice ${invoiceNumber} is ${status}. Amount: ${amount}. Due date: ${dueDate}.`,
    tags: ({ status }) => [
      { name: "category", value: "billing" },
      { name: "status", value: status },
    ],
  },
  deploymentStatus: {
    subject: ({ serviceName, status, environment }) =>
      `AhuraSense | ${serviceName} deployment ${status} on ${environment}`,
    previewText: ({ serviceName, status }) =>
      `${serviceName} deployment ${status}.`,
    render: (data) => <DeploymentStatusEmailTemplate {...data} />,
    text: ({ customerName, serviceName, environment, status }) =>
      `Hi ${customerName}, deployment for ${serviceName} on ${environment} finished with status ${status}.`,
    tags: ({ status, environment }) => [
      { name: "category", value: "deployments" },
      { name: "status", value: status },
      { name: "environment", value: environment },
    ],
  },
  systemAlert: {
    subject: ({ severity, alertTitle }) =>
      `AhuraSense | ${severity.toUpperCase()} alert: ${alertTitle}`,
    previewText: ({ serviceName }) => `System alert for ${serviceName}.`,
    render: (data) => <SystemAlertEmailTemplate {...data} />,
    text: ({ customerName, alertTitle, serviceName, severity }) =>
      `Hi ${customerName}, ${severity} alert "${alertTitle}" was triggered for ${serviceName}.`,
    tags: ({ severity }) => [
      { name: "category", value: "alerts" },
      { name: "severity", value: severity },
    ],
  },
  consultationRequest: {
    subject: ({ serviceName }) =>
      `AhuraSense | New consultation request for ${serviceName}`,
    previewText: ({ requesterName, serviceName }) =>
      `${requesterName} requested consultation for ${serviceName}.`,
    render: (data) => <ConsultationRequestEmailTemplate {...data} />,
    text: ({ requesterName, requesterEmail, serviceName, messageBody, submittedAt }) =>
      [
        "New consultation request",
        `Service: ${serviceName}`,
        `Name: ${requesterName}`,
        `Email: ${requesterEmail}`,
        `Submitted At: ${submittedAt}`,
        `Message: ${messageBody}`,
      ].join("\n"),
    tags: ({ serviceName }) => [
      { name: "category", value: "consultation" },
      { name: "service", value: serviceName.toLowerCase().replace(/\s+/g, "-") },
    ],
  },
  supportTicketCreated: {
    subject: ({ ticketNumber }) => `AhuraSense | Support ticket created: ${ticketNumber}`,
    previewText: ({ ticketSubject }) => `We've received your ticket: ${ticketSubject}`,
    render: (data) => <SupportTicketCreatedEmailTemplate {...data} />,
    text: ({ customerName, ticketNumber, ticketSubject, ticketBody, createdAt }) =>
      [
        `Hi ${customerName},`,
        "Your support request has been received.",
        `Ticket Number: ${ticketNumber}`,
        `Subject: ${ticketSubject}`,
        `Created At: ${createdAt}`,
        `Issue Body: ${ticketBody}`,
      ].join("\n"),
    tags: () => [
      { name: "category", value: "support" },
      { name: "event", value: "ticket-created" },
    ],
  },
  supportTicketReply: {
    subject: ({ ticketNumber }) => `AhuraSense | New reply on ticket ${ticketNumber}`,
    previewText: ({ ticketSubject }) => `Support replied to: ${ticketSubject}`,
    render: (data) => <SupportTicketReplyEmailTemplate {...data} />,
    text: ({ customerName, ticketNumber, ticketSubject, latestReply, repliedAt, ticketStatus }) =>
      [
        `Hi ${customerName},`,
        "A support team member replied to your ticket.",
        `Ticket Number: ${ticketNumber}`,
        `Subject: ${ticketSubject}`,
        `Status: ${ticketStatus}`,
        `Replied At: ${repliedAt}`,
        `Latest Reply: ${latestReply}`,
      ].join("\n"),
    tags: () => [
      { name: "category", value: "support" },
      { name: "event", value: "ticket-reply" },
    ],
  },
  inferenceEvent: {
    subject: ({ event, items }) => {
      // Surface the model/job name in the subject if the caller put it
      // first in items — makes inbox triage easy.
      const lead = items[0]?.value ? ` · ${items[0].value}` : "";
      const label =
        event === "finetune.succeeded" ? "Fine-tune finished" :
        event === "finetune.failed"    ? "Fine-tune failed" :
        event === "batch.completed"    ? "Batch completed" :
        event === "batch.failed"       ? "Batch failed" :
        event === "serving_pod.ready"  ? "Serving instance ready" :
        event === "serving_pod.stopped"? "Serving instance stopped" :
        event === "org.spend_threshold_reached" ? "Spend alert" :
        "Inference event";
      return `AhuraSense | ${label}${lead}`;
    },
    previewText: ({ summary }) => summary,
    render: (data) => <InferenceEventEmailTemplate {...data} />,
    text: ({ recipientName, event, summary, items, errorMessage }) =>
      [
        `Hi ${recipientName},`,
        `Event: ${event}`,
        summary,
        ...items.map((it) => `${it.label}: ${it.value}`),
        errorMessage ? `Error: ${errorMessage}` : null,
      ].filter(Boolean).join("\n"),
    tags: ({ event }) => [
      { name: "category", value: "inference" },
      { name: "event", value: event.replace(/\./g, "-") },
    ],
  },
  vpsPasswordReset: {
    subject: ({ serverName }) => `AhuraSense | Password reset for ${serverName}`,
    previewText: ({ protocol, serverName }) => `New ${protocol} password for ${serverName}.`,
    render: (data) => <VpsPasswordResetEmailTemplate {...data} />,
    text: ({ recipientName, serverName, ipAddress, loginUsername, password, protocol, port }) =>
      [
        `Hi ${recipientName},`,
        `The password for your server ${serverName} has been reset.`,
        `IP: ${ipAddress}`,
        `Username: ${loginUsername}`,
        `Password: ${password}`,
        `Connect via ${protocol} on port ${port}.`,
        `This password is shown only in this email and is not stored. Change it after signing in.`,
      ].join("\n"),
    tags: () => [{ name: "category", value: "compute" }],
  },
};
