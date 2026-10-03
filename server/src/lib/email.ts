import { env } from '../config/env.js';
import { logger } from './logger.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

export type EmailLang = 'en' | 'ar';

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
 * Outside production, or with no API key, the message is logged instead of
 * sent, which is what makes local development possible without an email
 * provider: the code shows up in the server console. Production refuses to
 * boot without a key unless EMAIL_CONSOLE is set deliberately.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  if (env.emailToConsole) {
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

/** The shared frame every email is drawn in. */
function shell(
  lang: EmailLang,
  parts: { heading: string; greeting: string; lead: string; code?: string; body?: string; footer: string },
): string {
  const rtl = lang === 'ar';
  const code = parts.code
    ? `<div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#fbbf24;background:#1e293b;
                  padding:18px;text-align:center;border-radius:10px;margin:18px 0;direction:ltr">${parts.code}</div>`
    : '';
  const body = parts.body ? `<p style="margin:12px 0">${parts.body}</p>` : '';
  return `
    <div dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;${
      rtl ? 'text-align:right;' : ''
    }max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
      <h1 style="color:#fbbf24;margin:0 0 16px;font-size:22px">${parts.heading}</h1>
      <p style="margin:0 0 8px">${parts.greeting}</p>
      <p style="margin:0 0 8px">${parts.lead}</p>
      ${code}${body}
      <p style="color:#94a3b8;font-size:13px;margin:16px 0 0">${parts.footer}</p>
    </div>`;
}

/** Bilingual one-time-code email for verifying a new account. */
export function otpEmail(name: string, code: string, lang: EmailLang): Omit<EmailMessage, 'to'> {
  const safeName = escapeHtml(name);

  if (lang === 'ar') {
    return {
      subject: 'رمز التحقق الخاص بك',
      html: shell('ar', {
        heading: 'منصة الشطرنج',
        greeting: `مرحباً ${safeName}،`,
        lead: 'رمز التحقق الخاص بك:',
        code,
        footer: 'صالح لمدة 10 دقائق. إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.',
      }),
      text: `رمز التحقق الخاص بك: ${code}\nصالح لمدة 10 دقائق.`,
    };
  }

  return {
    subject: 'Your verification code',
    html: shell('en', {
      heading: 'Chess Hub',
      greeting: `Hi ${safeName},`,
      lead: 'Your verification code:',
      code,
      footer: "Valid for 10 minutes. If you didn't request this, ignore this email.",
    }),
    text: `Your verification code is: ${code}\nValid for 10 minutes.`,
  };
}

/** Bilingual password-reset code email. */
export function passwordResetEmail(name: string, code: string, lang: EmailLang): Omit<EmailMessage, 'to'> {
  const safeName = escapeHtml(name);
  const link = `${env.APP_URL.replace(/\/$/, '')}/reset-password`;

  if (lang === 'ar') {
    return {
      subject: 'إعادة تعيين كلمة المرور',
      html: shell('ar', {
        heading: 'منصة الشطرنج',
        greeting: `مرحباً ${safeName}،`,
        lead: 'استخدم هذا الرمز لإعادة تعيين كلمة المرور:',
        code,
        body: `أدخله في <a href="${link}" style="color:#fbbf24">صفحة إعادة التعيين</a>.`,
        footer: 'صالح لمدة 15 دقيقة. إذا لم تطلب ذلك، فكلمة مرورك لم تتغير ويمكنك تجاهل هذه الرسالة.',
      }),
      text: `رمز إعادة تعيين كلمة المرور: ${code}\n${link}\nصالح لمدة 15 دقيقة.`,
    };
  }

  return {
    subject: 'Reset your password',
    html: shell('en', {
      heading: 'Chess Hub',
      greeting: `Hi ${safeName},`,
      lead: 'Use this code to reset your password:',
      code,
      body: `Enter it on the <a href="${link}" style="color:#fbbf24">reset page</a>.`,
      footer:
        "Valid for 15 minutes. If you didn't ask for this, your password has not changed and you can ignore this email.",
    }),
    text: `Your password reset code is: ${code}\n${link}\nValid for 15 minutes.`,
  };
}

/** Bilingual notice that an admin reviewed a profile-link request. */
export function linkReviewedEmail(
  name: string,
  playerName: string,
  approved: boolean,
  note: string | null,
  lang: EmailLang,
): Omit<EmailMessage, 'to'> {
  const safeName = escapeHtml(name);
  const safePlayer = escapeHtml(playerName);
  const safeNote = note ? escapeHtml(note) : null;
  const link = `${env.APP_URL.replace(/\/$/, '')}/settings?tab=link`;

  if (lang === 'ar') {
    const verdict = approved ? `تمت الموافقة على ربط حسابك بملف ${safePlayer}.` : `تم رفض طلب ربط حسابك بملف ${safePlayer}.`;
    return {
      subject: approved ? 'تمت الموافقة على طلب الربط' : 'تم رفض طلب الربط',
      html: shell('ar', {
        heading: 'منصة الشطرنج',
        greeting: `مرحباً ${safeName}،`,
        lead: verdict,
        body: `${safeNote ? `ملاحظة المشرف: «${safeNote}»<br/>` : ''}<a href="${link}" style="color:#fbbf24">عرض التفاصيل</a>`,
        footer: 'يمكنك إيقاف هذه الرسائل من إعدادات الإشعارات.',
      }),
      text: `${approved ? 'تمت الموافقة' : 'تم الرفض'}: ${playerName}${note ? `\n${note}` : ''}\n${link}`,
    };
  }

  const verdict = approved
    ? `Your account is now linked to the ${safePlayer} profile.`
    : `Your request to link your account to ${safePlayer} was declined.`;
  return {
    subject: approved ? 'Your profile link was approved' : 'Your profile link request was declined',
    html: shell('en', {
      heading: 'Chess Hub',
      greeting: `Hi ${safeName},`,
      lead: verdict,
      body: `${safeNote ? `Note from the reviewer: “${safeNote}”<br/>` : ''}<a href="${link}" style="color:#fbbf24">View details</a>`,
      footer: 'You can turn these emails off in your notification settings.',
    }),
    text: `${approved ? 'Approved' : 'Declined'}: ${playerName}${note ? `\n${note}` : ''}\n${link}`,
  };
}
