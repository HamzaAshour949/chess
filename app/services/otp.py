"""OTP code generation and validation helpers."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

OTP_TTL_MINUTES = 10
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_ATTEMPTS = 5


def generate_otp() -> str:
    """Cryptographically random 6-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def expiry_from_now() -> datetime:
    return datetime.utcnow() + timedelta(minutes=OTP_TTL_MINUTES)


def is_expired(expires_at: datetime | None) -> bool:
    return expires_at is None or datetime.utcnow() > expires_at


def can_resend(last_sent_at: datetime | None) -> bool:
    if last_sent_at is None:
        return True
    return (datetime.utcnow() - last_sent_at).total_seconds() >= OTP_RESEND_COOLDOWN_SECONDS
