"""Player-profile linking: user requests + admin approval."""
from __future__ import annotations

from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt

from app import db, limiter
from app.models import LinkRequest, Player, User
from app.routes.user_auth import current_user, user_required

links_bp = Blueprint("links", __name__)


def _admin_required(fn):
    """Admin-only route guard (claim role != 'user')."""
    from functools import wraps

    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        if get_jwt().get("role") == "user":
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)

    return wrapper


# ---- USER endpoints ---------------------------------------------------------

@links_bp.route("/request", methods=["POST"])
@user_required
@limiter.limit("5 per hour")
def request_link():
    u = current_user()
    if u.linked_player_id:
        return jsonify({"error": "Account is already linked to a player"}), 400

    data = request.get_json() or {}
    player_id = data.get("player_id")
    message = (data.get("message") or "").strip()[:1000] or None
    if not player_id:
        return jsonify({"error": "player_id is required"}), 400

    player = Player.query.get(int(player_id))
    if not player:
        return jsonify({"error": "Player not found"}), 404

    # Reject if a pending request already exists for this user
    existing = LinkRequest.query.filter_by(user_id=u.id, status="pending").first()
    if existing:
        return jsonify({"error": "You already have a pending link request",
                        "request": existing.to_dict()}), 409

    # Reject if this player is already linked to another user
    other = User.query.filter_by(linked_player_id=player.id).first()
    if other:
        return jsonify({"error": "This player is already linked to another account"}), 409

    lr = LinkRequest(user_id=u.id, player_id=player.id, message=message, status="pending")
    db.session.add(lr)
    db.session.commit()
    return jsonify(lr.to_dict()), 201


@links_bp.route("/my-requests", methods=["GET"])
@user_required
def my_requests():
    lang = request.args.get("lang", "en")
    rows = LinkRequest.query.filter_by(user_id=current_user().id).order_by(
        LinkRequest.created_at.desc()).all()
    return jsonify([r.to_dict(lang) for r in rows]), 200


# ---- ADMIN endpoints --------------------------------------------------------

@links_bp.route("/admin/requests", methods=["GET"])
@_admin_required
def list_requests():
    lang = request.args.get("lang", "en")
    status = request.args.get("status")  # pending | approved | rejected | all
    q = LinkRequest.query
    if status and status != "all":
        q = q.filter(LinkRequest.status == status)
    rows = q.order_by(LinkRequest.created_at.desc()).limit(200).all()
    return jsonify([r.to_dict(lang) for r in rows]), 200


@links_bp.route("/admin/requests/<int:req_id>/approve", methods=["POST"])
@_admin_required
def approve_request(req_id: int):
    data = request.get_json() or {}
    lr = LinkRequest.query.get_or_404(req_id)
    if lr.status != "pending":
        return jsonify({"error": "Already reviewed"}), 400

    # Re-check the player isn't already linked
    other = User.query.filter(User.linked_player_id == lr.player_id,
                              User.id != lr.user_id).first()
    if other:
        return jsonify({"error": "Player is already linked to another account"}), 409

    lr.status = "approved"
    lr.admin_note = (data.get("admin_note") or "").strip()[:1000] or None
    lr.reviewed_by_admin_id = int(get_jwt_identity())
    lr.reviewed_at = datetime.utcnow()
    lr.user.linked_player_id = lr.player_id
    db.session.commit()
    return jsonify(lr.to_dict()), 200


@links_bp.route("/admin/requests/<int:req_id>/reject", methods=["POST"])
@_admin_required
def reject_request(req_id: int):
    data = request.get_json() or {}
    lr = LinkRequest.query.get_or_404(req_id)
    if lr.status != "pending":
        return jsonify({"error": "Already reviewed"}), 400
    lr.status = "rejected"
    lr.admin_note = (data.get("admin_note") or "").strip()[:1000] or None
    lr.reviewed_by_admin_id = int(get_jwt_identity())
    lr.reviewed_at = datetime.utcnow()
    db.session.commit()
    return jsonify(lr.to_dict()), 200


@links_bp.route("/admin/users/<int:user_id>/unlink", methods=["POST"])
@_admin_required
def admin_unlink(user_id: int):
    """Admin can break a link if it was wrongly granted."""
    u = User.query.get_or_404(user_id)
    u.linked_player_id = None
    db.session.commit()
    return jsonify(u.public_dict()), 200


# ---- ADMIN: user moderation ------------------------------------------------

@links_bp.route("/admin/users", methods=["GET"])
@_admin_required
def list_users():
    """List all platform users with filters for moderation."""
    status = request.args.get("status", "all")  # all | active | banned | unverified
    search = (request.args.get("search") or "").strip()
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(100, max(1, int(request.args.get("per_page", 25))))

    q = User.query
    if status == "banned":
        q = q.filter(User.is_banned.is_(True))
    elif status == "active":
        q = q.filter(User.is_banned.is_(False), User.is_verified.is_(True))
    elif status == "unverified":
        q = q.filter(User.is_verified.is_(False))

    if search:
        like = f"%{search}%"
        q = q.filter(
            (User.username.ilike(like))
            | (User.email.ilike(like))
            | (User.display_name.ilike(like))
        )

    q = q.order_by(User.created_at.desc())
    paged = q.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        "users": [u.private_dict() for u in paged.items],
        "total": paged.total,
        "page": page,
        "pages": paged.pages,
        "per_page": per_page,
    }), 200


@links_bp.route("/admin/users/<int:user_id>/ban", methods=["POST"])
@_admin_required
def ban_user(user_id: int):
    data = request.get_json() or {}
    u = User.query.get_or_404(user_id)
    u.is_banned = True
    u.banned_at = datetime.utcnow()
    u.ban_reason = (data.get("reason") or "").strip()[:1000] or None
    db.session.commit()
    return jsonify(u.private_dict()), 200


@links_bp.route("/admin/users/<int:user_id>/unban", methods=["POST"])
@_admin_required
def unban_user(user_id: int):
    u = User.query.get_or_404(user_id)
    u.is_banned = False
    u.banned_at = None
    u.ban_reason = None
    db.session.commit()
    return jsonify(u.private_dict()), 200


@links_bp.route("/admin/users/<int:user_id>/verify", methods=["POST"])
@_admin_required
def admin_verify_user(user_id: int):
    """Admin can manually mark a user verified (e.g. failed email delivery)."""
    u = User.query.get_or_404(user_id)
    u.is_verified = True
    u.otp_code = None
    u.otp_expires_at = None
    db.session.commit()
    return jsonify(u.private_dict()), 200


@links_bp.route("/admin/users/<int:user_id>/mute", methods=["POST"])
@_admin_required
def admin_mute_user(user_id: int):
    """Admin chat-mute (prevents user from posting any chat / DM)."""
    u = User.query.get_or_404(user_id)
    u.chat_muted = True
    db.session.commit()
    return jsonify(u.private_dict()), 200


@links_bp.route("/admin/users/<int:user_id>/unmute", methods=["POST"])
@_admin_required
def admin_unmute_user(user_id: int):
    u = User.query.get_or_404(user_id)
    u.chat_muted = False
    db.session.commit()
    return jsonify(u.private_dict()), 200
