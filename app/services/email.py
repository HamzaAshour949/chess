"""Email delivery service.

Wraps Brevo (Sendinblue) transactional email API. If `BREVO_API_KEY` is
not set, falls back to logging emails to stdout — useful for local dev.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import requests

logger = logging.getLogger(__name__)

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def _api_key() -> Optional[str]:
    return os.getenv("BREVO_API_KEY")


def _from_email() -> str:
    return os.getenv("BREVO_FROM_EMAIL", "no-reply@chess-platform.local")


def _from_name() -> str:
    return os.getenv("BREVO_FROM_NAME", "Chess Platform")


def send_email(to_email: str, to_name: str, subject: str, html: str, text: str = "") -> bool:
    """Send a transactional email via Brevo. Returns True on success."""
    api_key = _api_key()
    if not api_key:
        # Dev fallback: log to console
        logger.warning("[DEV EMAIL] To: %s | Subject: %s\n%s", to_email, subject, text or html)
        print(f"\n[DEV EMAIL] To: {to_email}\nSubject: {subject}\n{text or html}\n")
        return True

    payload = {
        "sender": {"name": _from_name(), "email": _from_email()},
        "to": [{"email": to_email, "name": to_name or to_email}],
        "subject": subject,
        "htmlContent": html,
    }
    if text:
        payload["textContent"] = text

    try:
        resp = requests.post(
            BREVO_API_URL,
            json=payload,
            headers={
                "api-key": api_key,
                "accept": "application/json",
                "content-type": "application/json",
            },
            timeout=10,
        )
        if resp.status_code >= 400:
            logger.error("Brevo send failed (%s): %s", resp.status_code, resp.text)
            return False
        return True
    except requests.RequestException as e:
        logger.error("Brevo network error: %s", e)
        return False


def send_otp_email(to_email: str, to_name: str, otp_code: str, lang: str = "en") -> bool:
    if lang == "ar":
        subject = "رمز التحقق الخاص بك"
        html = f"""
        <div style="font-family:system-ui,-apple-system,sans-serif;direction:rtl;text-align:right;
                    max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
          <h1 style="color:#fbbf24;margin:0 0 16px">منصة الشطرنج</h1>
          <p>مرحباً {to_name}،</p>
          <p>رمز التحقق الخاص بك:</p>
          <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#fbbf24;
                      background:#1e293b;padding:18px;text-align:center;border-radius:10px;margin:18px 0">
            {otp_code}
          </div>
          <p style="color:#94a3b8;font-size:13px">صالح لمدة 10 دقائق. إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.</p>
        </div>
        """
        text = f"رمز التحقق الخاص بك: {otp_code}\nصالح لمدة 10 دقائق."
    else:
        subject = "Your verification code"
        html = f"""
        <div style="font-family:system-ui,-apple-system,sans-serif;
                    max-width:480px;margin:0 auto;padding:24px;background:#0f172a;color:#e2e8f0;border-radius:12px">
          <h1 style="color:#fbbf24;margin:0 0 16px">Chess Platform</h1>
          <p>Hi {to_name},</p>
          <p>Your verification code:</p>
          <div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#fbbf24;
                      background:#1e293b;padding:18px;text-align:center;border-radius:10px;margin:18px 0">
            {otp_code}
          </div>
          <p style="color:#94a3b8;font-size:13px">Valid for 10 minutes. If you didn't request this, ignore this email.</p>
        </div>
        """
        text = f"Your verification code is: {otp_code}\nValid for 10 minutes."
    return send_email(to_email, to_name, subject, html, text)
