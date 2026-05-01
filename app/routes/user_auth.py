"""User-facing authentication: register / verify-otp / login / me / resend-otp."""
from __future__ import annotations

import re
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import (create_access_token, get_jwt, get_jwt_identity,
                                jwt_required)

from app import db, limiter
from app.models import User
from app.services.email import send_otp_email
from app.services.otp import (OTP_MAX_ATTEMPTS, can_resend, expiry_from_now,
                              generate_otp, is_expired)

user_auth_bp = Blueprint("user_auth", __name__)

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,30}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _user_token(user: User) -> str:
    """Issue a JWT with role=user so admin endpoints reject it."""
    return create_access_token(
        identity=str(user.id),
        additional_claims={"role": "user"},
    )


def current_user() -> User | None:
    """Return the authenticated User, or None if the token is for an admin."""
    claims = get_jwt()
    if claims.get("role") != "user":
        return None
    uid = get_jwt_identity()
    return User.query.get(int(uid)) if uid else None


def user_required(fn):
    """Decorator: require a verified user JWT."""
    from functools import wraps

    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        u = current_user()
        if not u:
            return jsonify({"error": "User authentication required"}), 401
        if u.is_banned:
            return jsonify({"error": "Account suspended", "ban_reason": u.ban_reason}), 403
        if not u.is_verified:
            return jsonify({"error": "Email not verified"}), 403
        return fn(*args, **kwargs)

    return wrapper


@user_auth_bp.route("/register", methods=["POST"])
@limiter.limit("5 per minute; 30 per hour")
def register():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    display_name = (data.get("display_name") or "").strip() or None
    country = (data.get("country") or "").strip() or None
    lang = (data.get("lang") or "en").lower()

    if not USERNAME_RE.match(username):
        return jsonify({"error": "Username must be 3-30 chars (letters, digits, underscore)"}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Invalid email"}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(username=username, email=email, display_name=display_name, country=country)
    user.set_password(password)
    user.otp_code = generate_otp()
    user.otp_expires_at = expiry_from_now()
    user.otp_last_sent_at = datetime.utcnow()
    user.otp_attempts = 0
    db.session.add(user)
    db.session.commit()

    send_otp_email(user.email, user.display_name or user.username, user.otp_code, lang=lang)

    return jsonify({
        "message": "Verification code sent",
        "email": user.email,
        "user_id": user.id,
    }), 201


@user_auth_bp.route("/verify-otp", methods=["POST"])
@limiter.limit("10 per minute")
def verify_otp():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()

    if not email or not code:
        return jsonify({"error": "Email and code are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "Invalid code"}), 400
    if user.is_verified:
        return jsonify({"error": "Already verified"}), 400
    if user.otp_attempts >= OTP_MAX_ATTEMPTS:
        return jsonify({"error": "Too many attempts. Request a new code."}), 429
    if is_expired(user.otp_expires_at):
        return jsonify({"error": "Code expired. Request a new one."}), 400

    if user.otp_code != code:
        user.otp_attempts += 1
        db.session.commit()
        return jsonify({"error": "Invalid code"}), 400

    user.is_verified = True
    user.otp_code = None
    user.otp_expires_at = None
    user.otp_attempts = 0
    user.last_login_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        "token": _user_token(user),
        "user": user.private_dict(),
    }), 200


@user_auth_bp.route("/resend-otp", methods=["POST"])
@limiter.limit("3 per minute; 10 per hour")
def resend_otp():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    lang = (data.get("lang") or "en").lower()
    user = User.query.filter_by(email=email).first()
    # Don't reveal whether email exists; respond identically either way.
    if user and not user.is_verified and can_resend(user.otp_last_sent_at):
        user.otp_code = generate_otp()
        user.otp_expires_at = expiry_from_now()
        user.otp_last_sent_at = datetime.utcnow()
        user.otp_attempts = 0
        db.session.commit()
        send_otp_email(user.email, user.display_name or user.username, user.otp_code, lang=lang)
    return jsonify({"message": "If the email is registered, a code has been sent"}), 200


@user_auth_bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    data = request.get_json() or {}
    identifier = (data.get("identifier") or data.get("email") or data.get("username") or "").strip().lower()
    password = data.get("password") or ""
    if not identifier or not password:
        return jsonify({"error": "Credentials required"}), 400

    user = (User.query.filter_by(email=identifier).first()
            or User.query.filter_by(username=identifier).first()
            or User.query.filter_by(username=data.get("identifier", "").strip()).first())
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid credentials"}), 401

    if user.is_banned:
        return jsonify({
            "error": "Account suspended",
            "is_banned": True,
            "ban_reason": user.ban_reason,
        }), 403

    if not user.is_verified:
        # Re-issue an OTP automatically and ask client to verify
        user.otp_code = generate_otp()
        user.otp_expires_at = expiry_from_now()
        user.otp_last_sent_at = datetime.utcnow()
        user.otp_attempts = 0
        db.session.commit()
        lang = (data.get("lang") or "en").lower()
        send_otp_email(user.email, user.display_name or user.username, user.otp_code, lang=lang)
        return jsonify({
            "error": "Email not verified",
            "needs_verification": True,
            "email": user.email,
        }), 403

    user.last_login_at = datetime.utcnow()
    db.session.commit()
    return jsonify({"token": _user_token(user), "user": user.private_dict()}), 200


@user_auth_bp.route("/me", methods=["GET"])
@user_required
def me():
    return jsonify(current_user().private_dict()), 200


@user_auth_bp.route("/me", methods=["PATCH"])
@user_required
def update_me():
    data = request.get_json() or {}
    u = current_user()
    if "display_name" in data:
        dn = (data["display_name"] or "").strip()
        u.display_name = dn[:120] if dn else None
    if "country" in data:
        c = (data["country"] or "").strip()
        u.country = c[:100] if c else None
    if "avatar_url" in data:
        au = (data["avatar_url"] or "").strip()
        u.avatar_url = au[:500] if au else None
    # Notification / privacy preferences
    for key in ("notif_email", "notif_dm", "notif_game_chat", "notif_sound"):
        if key in data:
            setattr(u, key, bool(data[key]))
    db.session.commit()
    return jsonify(u.private_dict()), 200
