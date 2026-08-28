import { env } from '../config/env.js';
import { logger } from './logger.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}

/** Escape untrusted values before interpolating them into an HTML email. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send a transactional email through Brevo.
 *
 * With no API key configured the message is logged instead of sent, which is
 * what makes local development possible without an email provider: the OTP
 * shows up in the server console.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (!env.BREVO_API_KEY) {
    logger.info(
      { to: message.to, subject: message.subject },
      `[dev email] ${message.text ?? message.subject}`,
    );
    return true;
  }

  try {
    const response = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: env.BREVO_FROM_NAME, email: env.BREVO_FROM_EMAIL },
        to: [{ email: message.to, name: message.toName || message.to }],
        subject: message.subject,
        htmlContent: message.html,
        ...(message.text ? { textContent: message.text } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, body: await response.text().catch(() => '') },
        'Brevo rejected the message',
      );
      return false;
    }
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Brevo request failed');
    return false;
  }
}

/** Bilingual one-time-code email. */
export function otpEmail(name: string, code: string, lang: string): Omit<EmailMessage, 'to'> {
  const safeName = escapeHtml(name);
  const arabic = lang === 'ar';

  const shell = (heading: string, greeting: string, lead: string, footer: string) => `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;${
      arabic ? 'direction:rtl;text-align:right;' : ''
    }max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
      <h1 style="color:#fbbf24;margin:0 0 16px;font-size:22px">${heading}</h1>
      <p style="margin:0 0 8px">${greeting}</p>
      <p style="margin:0 0 8px">${lead}</p>
      <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#fbbf24;background:#1e293b;
                  padding:18px;text-align:center;border-radius:10px;margin:18px 0">${code}</div>
      <p style="color:#94a3b8;font-size:13px;margin:0">${footer}</p>
    </div>`;

  if (arabic) {
    return {
      subject: 'رمز التحقق الخاص بك',
      html: shell(
        'منصة الشطرنج',
        `مرحباً ${safeName}،`,
        'رمز التحقق الخاص بك:',
        'صالح لمدة 10 دقائق. إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.',
      ),
      text: `رمز التحقق الخاص بك: ${code}\nصالح لمدة 10 دقائق.`,
    };
  }

  return {
    subject: 'Your verification code',
    html: shell(
      'Chess Hub',
      `Hi ${safeName},`,
      'Your verification code:',
      "Valid for 10 minutes. If you didn't request this, ignore this email.",
    ),
    text: `Your verification code is: ${code}\nValid for 10 minutes.`,
  };
}
