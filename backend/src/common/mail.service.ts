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

  /** Helper to format dates to UTC iCalendar format (YYYYMMDDTHHMMSSZ) */
  private formatIcsDate(date: Date): string {
    return date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  }

  /** Generates RFC 5545 compliant iCalendar (.ics) string */
  generateIcsString(event: {
    id: string;
    title: string;
    description?: string | null;
    startsAt: Date;
    endsAt: Date;
    meetingLink?: string | null;
    teamName?: string | null;
    organizerName?: string;
    organizerEmail?: string;
    attendees?: Array<{ name: string; email: string }>;
  }): string {
    const dtStamp = this.formatIcsDate(new Date());
    const dtStart = this.formatIcsDate(new Date(event.startsAt));
    const dtEnd = this.formatIcsDate(new Date(event.endsAt));
    const organizerLine = event.organizerEmail
      ? `ORGANIZER;CN=${event.organizerName || 'Organizer'}:mailto:${event.organizerEmail}\r\n`
      : '';
    const attendeeLines = (event.attendees || [])
      .filter((a) => a.email)
      .map(
        (a) =>
          `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${a.name || a.email}:mailto:${a.email}`,
      )
      .join('\r\n');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TeamTime//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:event-${event.id}@teamtime.live`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${(event.title || 'Meeting').replace(/\n/g, ' ')}`,
      `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')}${event.meetingLink ? `\\n\\nJoin meeting: ${event.meetingLink}` : ''}`,
      event.meetingLink ? `LOCATION:${event.meetingLink}` : '',
      `STATUS:CONFIRMED`,
      organizerLine ? organizerLine.trimEnd() : '',
      attendeeLines ? attendeeLines : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');
  }

  async sendCalendarInvite(options: {
    to: string;
    recipientName?: string;
    timeZone?: string;
    event: {
      id: string;
      title: string;
      description?: string | null;
      startsAt: Date;
      endsAt: Date;
      meetingLink?: string | null;
      teamName?: string | null;
      organizerName?: string;
      organizerEmail?: string;
      attendees?: Array<{ name: string; email: string }>;
    };
  }): Promise<boolean> {
    const { event, to, recipientName } = options;
    const startsAt = new Date(event.startsAt);
    const endsAt = new Date(event.endsAt);
    const icsContent = this.generateIcsString(event);

    const timeZone =
      options.timeZone || process.env.APP_TIMEZONE || 'Asia/Kolkata';

    let dateFormatted = '';
    let timeFormatted = '';

    try {
      dateFormatted = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone,
      }).format(startsAt);

      const startTimeFormatted = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone,
      }).format(startsAt);

      const endTimeFormatted = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone,
        timeZoneName: 'short',
      }).format(endsAt);

      timeFormatted = `${startTimeFormatted} - ${endTimeFormatted}`;
    } catch {
      dateFormatted = startsAt.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      timeFormatted = `${startsAt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })} - ${endsAt.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}`;
    }

    const subject = `Invitation: ${event.title} @ ${dateFormatted} (${timeFormatted})`;

    const text = `You're invited to: ${event.title}\n\nDate: ${dateFormatted}\nTime: ${timeFormatted}\n${
      event.organizerName ? `Organizer: ${event.organizerName}\n` : ''
    }${event.description ? `Description: ${event.description}\n` : ''}${
      event.meetingLink ? `Join Meeting Link: ${event.meetingLink}\n` : ''
    }\nAn event invite (.ics) is attached to add this to your calendar.`;

    const html = this.layout(
      'Calendar Invitation',
      `<p style="margin:0 0 16px;font-size:14px;color:#475569">Hi ${recipientName || 'there'}, you have been invited to an event:</p>
       <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:0 0 20px">
         <h3 style="margin:0 0 8px;font-size:18px;color:#0f172a">${event.title}</h3>
         ${event.teamName ? `<div style="margin:0 0 10px;display:inline-block;background:#e0e7ff;color:#3730a3;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px">${event.teamName}</div>` : ''}
         <p style="margin:6px 0;font-size:14px;color:#334155"><strong>📅 Date:</strong> ${dateFormatted}</p>
         <p style="margin:6px 0;font-size:14px;color:#334155"><strong>⏰ Time:</strong> ${timeFormatted}</p>
         ${event.organizerName ? `<p style="margin:6px 0;font-size:14px;color:#334155"><strong>👤 Organizer:</strong> ${event.organizerName}</p>` : ''}
         ${event.description ? `<p style="margin:12px 0 6px;font-size:13px;color:#64748b;line-height:20px">${event.description}</p>` : ''}
       </div>
       ${
         event.meetingLink
           ? `<p style="margin:0 0 16px"><a href="${event.meetingLink}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">Join Meeting Room</a></p>`
           : ''
       }
       <p style="margin:0;font-size:12px;color:#94a3b8">The calendar invite (.ics) is attached to this email. You can also import it to Google Calendar, Outlook, or Apple Calendar.</p>`,
    );

    if (!this.transporter) {
      this.logger.log(
        `[MAIL] (disabled) would send calendar invite "${subject}" to ${to}`,
      );
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html,
        icalEvent: {
          filename: 'invite.ics',
          method: 'REQUEST',
          content: icsContent,
        },
        attachments: [
          {
            filename: 'invite.ics',
            content: icsContent,
            contentType: 'text/calendar; charset=utf-8; method=REQUEST',
          },
        ],
      });
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `[MAIL] Failed to send calendar invite to ${to}: ${reason}`,
      );
      return false;
    }
  }
}
