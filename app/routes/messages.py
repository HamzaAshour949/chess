"""Direct messaging between users + block list.

DMs are private; only sender and recipient can read. Admin can list/delete
any DM for moderation.
"""
from __future__ import annotations

import re
from datetime import datetime
from functools import wraps

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from sqlalchemy import or_, and_, func

from app import db, limiter
from app.models import BlockedUser, DirectMessage, User
from app.routes.user_auth import current_user, user_required

messages_bp = Blueprint("messages", __name__)


def _admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        if get_jwt().get("role") == "user":
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)


def _sanitize(text: str, limit: int = 2000) -> str:
    text = (text or "").strip()
    if len(text) > limit:
        text = text[:limit]
    text = _URL_RE.sub("[link removed]", text)
    return text


# ============================ User: DMs ====================================

@messages_bp.route("/threads", methods=["GET"])
@user_required
def list_threads():
    """Return one row per conversation partner with last message + unread count."""
    me = current_user()

    # Latest message per (other_user_id) ordered by created_at desc
    rows = DirectMessage.query.filter(
        or_(DirectMessage.sender_id == me.id, DirectMessage.recipient_id == me.id)
    ).order_by(DirectMessage.created_at.desc()).limit(500).all()

    threads = {}
    for m in rows:
        other_id = m.recipient_id if m.sender_id == me.id else m.sender_id
        if other_id not in threads:
            threads[other_id] = {
                "other_user": (m.recipient if m.sender_id == me.id else m.sender),
                "last_message": m,
                "unread": 0,
            }
        if m.recipient_id == me.id and not m.is_read:
            threads[other_id]["unread"] += 1

    out = []
    for other_id, t in threads.items():
        ou = t["other_user"]
        out.append({
            "other_user": ou.public_dict() if ou else None,
            "last_message": t["last_message"].to_dict(viewer_id=me.id),
            "unread": t["unread"],
        })
    out.sort(key=lambda x: x["last_message"]["created_at"] or "", reverse=True)
    return jsonify(out), 200


@messages_bp.route("/with/<int:other_id>", methods=["GET"])
@user_required
def get_thread(other_id: int):
    me = current_user()
    if other_id == me.id:
        return jsonify({"error": "Cannot DM yourself"}), 400
    other = User.query.get_or_404(other_id)

    rows = DirectMessage.query.filter(
        or_(
            and_(DirectMessage.sender_id == me.id, DirectMessage.recipient_id == other.id),
            and_(DirectMessage.sender_id == other.id, DirectMessage.recipient_id == me.id),
        )
    ).order_by(DirectMessage.created_at.asc()).limit(500).all()

    # Mark recipient-side messages as read
    unread = [m for m in rows if m.recipient_id == me.id and not m.is_read]
    for m in unread:
        m.is_read = True
    if unread:
        db.session.commit()

    return jsonify({
        "other_user": other.public_dict(),
        "messages": [m.to_dict(viewer_id=me.id) for m in rows],
    }), 200


@messages_bp.route("/with/<int:other_id>", methods=["POST"])
@user_required
@limiter.limit("30 per minute")
def send_dm(other_id: int):
    me = current_user()
    if other_id == me.id:
        return jsonify({"error": "Cannot DM yourself"}), 400
    other = User.query.get_or_404(other_id)

    if other.is_banned:
        return jsonify({"error": "User is unavailable"}), 403
    if me.chat_muted:
        return jsonify({"error": "You are muted"}), 403
    if not other.notif_dm:
        return jsonify({"error": "Recipient has DMs disabled"}), 403

    blocked = BlockedUser.query.filter(
        or_(
            and_(BlockedUser.blocker_id == me.id, BlockedUser.blocked_id == other.id),
            and_(BlockedUser.blocker_id == other.id, BlockedUser.blocked_id == me.id),
        )
    ).first()
    if blocked:
        return jsonify({"error": "Cannot send message"}), 403

    data = request.get_json() or {}
    content = _sanitize(data.get("content") or "", 2000)
    if not content:
        return jsonify({"error": "Message is empty"}), 400

    m = DirectMessage(sender_id=me.id, recipient_id=other.id, content=content)
    db.session.add(m)
    db.session.commit()
    return jsonify(m.to_dict(viewer_id=me.id)), 201


@messages_bp.route("/unread-count", methods=["GET"])
@user_required
def unread_count():
    me = current_user()
    n = DirectMessage.query.filter_by(recipient_id=me.id, is_read=False, is_deleted=False).count()
    return jsonify({"unread": n}), 200


# ============================ User: blocks ==================================

@messages_bp.route("/blocks", methods=["GET"])
@user_required
def list_blocks():
    me = current_user()
    rows = BlockedUser.query.filter_by(blocker_id=me.id).all()
    users = User.query.filter(User.id.in_([r.blocked_id for r in rows])).all() if rows else []
    return jsonify([u.public_dict() for u in users]), 200


@messages_bp.route("/blocks/<int:other_id>", methods=["POST"])
@user_required
def block_user(other_id: int):
    me = current_user()
    if other_id == me.id:
        return jsonify({"error": "Cannot block yourself"}), 400
    if not User.query.get(other_id):
        return jsonify({"error": "User not found"}), 404
    if BlockedUser.query.filter_by(blocker_id=me.id, blocked_id=other_id).first():
        return jsonify({"message": "Already blocked"}), 200
    db.session.add(BlockedUser(blocker_id=me.id, blocked_id=other_id))
    db.session.commit()
    return jsonify({"message": "Blocked"}), 201


@messages_bp.route("/blocks/<int:other_id>", methods=["DELETE"])
@user_required
def unblock_user(other_id: int):
    me = current_user()
    row = BlockedUser.query.filter_by(blocker_id=me.id, blocked_id=other_id).first()
    if row:
        db.session.delete(row)
        db.session.commit()
    return jsonify({"message": "Unblocked"}), 200


# ============================ Admin moderation ==============================

@messages_bp.route("/admin/dms", methods=["GET"])
@_admin_required
def admin_list_dms():
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(5, int(request.args.get("per_page", 50))))
    except ValueError:
        page, per_page = 1, 50

    q = DirectMessage.query
    only = (request.args.get("only") or "all").lower()
    if only == "active":
        q = q.filter_by(is_deleted=False)
    elif only == "deleted":
        q = q.filter_by(is_deleted=True)

    search = (request.args.get("search") or "").strip()
    if search:
        q = q.filter(DirectMessage.content.like(f"%{search}%"))

    pagination = q.order_by(DirectMessage.created_at.desc())\
                  .paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        "messages": [m.to_dict() for m in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
    }), 200


@messages_bp.route("/admin/dms/<int:msg_id>", methods=["DELETE"])
@_admin_required
def admin_delete_dm(msg_id: int):
    m = DirectMessage.query.get_or_404(msg_id)
    m.is_deleted = True
    try:
        m.deleted_by_admin_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        pass
    db.session.commit()
    return jsonify(m.to_dict()), 200
