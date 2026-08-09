import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * SMTP delivery, configured entirely through environment variables so no
 * provider is baked in:
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE
 *
 * When SMTP_HOST is absent the service becomes a no-op that logs what it
 * would have sent. That keeps local development working without credentials,
 * and means a misconfigured production box degrades to "no email" rather than
 * throwing inside a request handler.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.logger.warn(
        '[MAIL] SMTP_HOST is not set - email is disabled and messages will only be logged',
      );
      return;
    }

    const port = Number(process.env.SMTP_PORT) || 587;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      // Implicit TLS on 465, STARTTLS elsewhere.
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    this.logger.log(`[MAIL] SMTP configured for ${host}:${port}`);
  }

  get isConfigured(): boolean {
    return this.transporter !== null;
  }

  /**
   * Best-effort send. Never throws: callers are in request paths where a mail
   * outage must not surface as a failed sign-in or a 500.
   */
  async send(options: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(
        `[MAIL] (disabled) would send "${options.subject}" to ${options.to}`,
      );
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`[MAIL] Failed to send to ${options.to}: ${reason}`);
      return false;
    }
  }

  /** Wraps body copy in a minimal, client-safe HTML shell. */
  private layout(heading: string, body: string): string {
    return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="margin:0 0 16px;font-size:18px">${heading}</h2>
  ${body}
  <p style="margin-top:24px;font-size:12px;color:#94a3b8">TeamTime</p>
</div>`;
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<boolean> {
    return await this.send({
      to,
      subject: 'Reset your TeamTime password',
      text: `Use this link to choose a new password. It expires in 30 minutes and can only be used once.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email — your password will not change.`,
      html: this.layout(
        'Reset your password',
        `<p style="margin:0 0 16px;font-size:14px;line-height:22px">Use the link below to choose a new password. It expires in 30 minutes and can only be used once.</p>
         <p style="margin:0 0 16px"><a href="${resetUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600">Choose a new password</a></p>
         <p style="margin:0;font-size:13px;color:#64748b">If you did not request this, you can ignore this email — your password will not change.</p>`,
      ),
    });
  }

  async sendTwoFactorCode(to: string, code: string): Promise<boolean> {
    return await this.send({
      to,
      subject: `${code} is your TeamTime sign-in code`,
      text: `Your sign-in code is ${code}. It expires shortly. If you did not try to sign in, change your password.`,
      html: this.layout(
        'Your sign-in code',
        `<p style="margin:0 0 12px;font-size:32px;font-weight:700;letter-spacing:6px">${code}</p>
         <p style="margin:0;font-size:13px;color:#64748b">This code expires shortly. If you did not try to sign in, change your password.</p>`,
      ),
    });
  }
}
