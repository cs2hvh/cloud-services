import { resend } from "@/lib/resend";
import { getEmailConfig } from "@/lib/email/config";
import { emailLogger } from "@/lib/email/logger";
import { emailTemplates } from "@/lib/email/templates";
import type {
  EmailSendOptions,
  EmailTemplateId,
  SendEmailResult,
} from "@/lib/email/types";

export class EmailService {
  buildMessage<K extends EmailTemplateId>(options: EmailSendOptions<K>) {
    const template = emailTemplates[options.template];

    if (!template) {
      throw new Error(`Email template "${String(options.template)}" is not registered`);
    }

    const config = getEmailConfig();
    const subject = template.subject(options.data);

    return {
      from: config.from,
      to: options.to,
      cc: options.cc,
      bcc: options.bcc,
      replyTo: options.replyTo || config.replyTo,
      subject,
      react: template.render(options.data),
      text: template.text?.(options.data),
      headers: options.headers,
      tags: [...(template.tags?.(options.data) || []), ...(options.tags || [])],
    };
  }

  async sendTemplate<K extends EmailTemplateId>(
    options: EmailSendOptions<K>,
  ): Promise<SendEmailResult> {
    try {
      const message = this.buildMessage(options);
      const response = await resend.emails.send(message);

      if (response.error) {
        emailLogger.error("Resend rejected email send", {
          template: options.template,
          to: options.to,
          error: response.error,
        });

        return {
          success: false,
          message: "Failed to send email.",
          error: response.error,
        };
      }

      emailLogger.info("Email sent", {
        id: response.data?.id,
        template: options.template,
        to: options.to,
      });

      return {
        success: true,
        message: "Email sent successfully.",
        id: response.data?.id,
      };
    } catch (error) {
      emailLogger.error("Unexpected email send failure", {
        template: options.template,
        to: options.to,
        error,
      });

      return {
        success: false,
        message: "Failed to send email.",
        error,
      };
    }
  }
}

export const emailService = new EmailService();
