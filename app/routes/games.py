"""Online games: lobby, challenges, moves, draws, resignation, chat.

Server-authoritative chess: every move is validated by python-chess.
Clients use HTTP polling against `GET /api/games/<id>` for opponent moves.

Clock security:
- Clocks are decremented SERVER-SIDE on each move using the elapsed time
  between `last_move_at` and `datetime.utcnow()`. Clients display only.
- A lazy "flag check" runs on every GET /<id> and on every move attempt:
  if the player whose turn it is has run out of time, the game is ended
  with the opponent winning.
"""
from __future__ import annotations

import random
import re
from datetime import datetime
from functools import wraps

import chess
import chess.pgn
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity

from app import db, limiter
from app.models import (
    DEFAULT_ONLINE_RATING, BlockedUser, Game, GameMessage, User
)
from app.routes.user_auth import current_user, user_required
from app.services.elo import calc_new_ratings

games_bp = Blueprint("games", __name__)


# --------------------------------------------------------------- helpers ----

def _serialize(g: Game) -> dict:
    d = g.to_dict()
    d["version"] = g.move_count * 2 + (1 if g.status not in ("open", "active") else 0)
    if g.status == "open":
        d["creator_user"] = (g.creator.public_dict() if g.creator else None)
    return d


def _player_role(g: Game, user: User) -> str | None:
    if g.white_user_id == user.id:
        return "white"
    if g.black_user_id == user.id:
        return "black"
    return None


def _board_from_game(g: Game) -> chess.Board:
    return chess.Board(g.fen)


def _admin_required(fn):
    @wraps(fn)
    @jwt_required()
    def wrapper(*args, **kwargs):
        if get_jwt().get("role") == "user":
            return jsonify({"error": "Admin access required"}), 403
        return fn(*args, **kwargs)
    return wrapper


def _apply_result(g: Game, result: str) -> None:
    """Mark game ended and apply Elo if rated."""
    g.result = result
    if result == "1-0":
        g.status = "white_wins"
    elif result == "0-1":
        g.status = "black_wins"
    else:
        g.status = "draw"
    g.ended_at = datetime.utcnow()

    w, b = g.white_user, g.black_user
    if w and b:
        if result == "1-0":
            w.games_won += 1; b.games_lost += 1
        elif result == "0-1":
            b.games_won += 1; w.games_lost += 1
        else:
            w.games_drawn += 1; b.games_drawn += 1
        w.games_played += 1
        b.games_played += 1

        g.white_rating_before = w.online_rating
        g.black_rating_before = b.online_rating

        if g.rated:
            new_w, new_b = calc_new_ratings(
                w.online_rating, b.online_rating,
                w.games_played - 1, b.games_played - 1,
                result,
            )
            w.online_rating = new_w
            b.online_rating = new_b

        g.white_rating_after = w.online_rating
        g.black_rating_after = b.online_rating


def _enforce_clocks(g: Game) -> bool:
    """If the on-the-move player has flagged, end the game. Returns True if applied.
    Caller commits."""
    if g.status != "active" or not g.time_control_seconds:
        return False
    if g.white_time_remaining is None or g.black_time_remaining is None:
        return False
    now = datetime.utcnow()
    last = g.last_move_at or g.started_at or now
    elapsed = max(0.0, (now - last).total_seconds())
    board = _board_from_game(g)
    on_move = "white" if board.turn == chess.WHITE else "black"
    if on_move == "white" and elapsed >= g.white_time_remaining:
        g.white_time_remaining = 0
        _apply_result(g, "0-1")
        return True
    if on_move == "black" and elapsed >= g.black_time_remaining:
        g.black_time_remaining = 0
        _apply_result(g, "1-0")
        return True
    return False


def _consume_clock_for_move(g: Game) -> None:
    """Subtract elapsed time from mover's clock; add Fischer increment."""
    if not g.time_control_seconds:
        return
    if g.white_time_remaining is None or g.black_time_remaining is None:
        return
    now = datetime.utcnow()
    last = g.last_move_at or g.started_at or now
    elapsed = (now - last).total_seconds()
    board = _board_from_game(g)
    on_move = "white" if board.turn == chess.WHITE else "black"
    inc = g.increment_seconds or 0
    if on_move == "white":
        g.white_time_remaining = max(0, int(round(g.white_time_remaining - elapsed + inc)))
    else:
        g.black_time_remaining = max(0, int(round(g.black_time_remaining - elapsed + inc)))


# --------------------------------------------------------------- public -----

@games_bp.route("/lobby", methods=["GET"])
def lobby():
    q = Game.query.filter_by(status="open")

    rated = (request.args.get("rated") or "all").lower()
    if rated in ("true", "1", "yes"):
        q = q.filter(Game.rated.is_(True))
    elif rated in ("false", "0", "no"):
        q = q.filter(Game.rated.is_(False))

    color = (request.args.get("color") or "any").lower()
    if color in ("white", "black", "random"):
        q = q.filter(Game.creator_color == color)

    try:
        min_tc = int(request.args.get("min_tc") or 0)
        max_tc = int(request.args.get("max_tc") or 0)
    except ValueError:
        min_tc = max_tc = 0
    if min_tc > 0:
        q = q.filter(Game.time_control_seconds >= min_tc)
    if max_tc > 0:
        q = q.filter(Game.time_control_seconds <= max_tc)

    rows = q.order_by(Game.created_at.desc()).limit(50).all()

    try:
        viewer_rating = int(request.args.get("viewer_rating") or 0)
    except ValueError:
        viewer_rating = 0
    if viewer_rating > 0:
        rows = [g for g in rows if (
            (g.min_opp_rating is None or viewer_rating >= g.min_opp_rating) and
            (g.max_opp_rating is None or viewer_rating <= g.max_opp_rating)
        )]
    return jsonify([_serialize(g) for g in rows]), 200


@games_bp.route("/recent", methods=["GET"])
def recent():
    rows = (Game.query.filter(Game.status.in_(["white_wins", "black_wins", "draw"]))
            .order_by(Game.ended_at.desc()).limit(20).all())
    return jsonify([_serialize(g) for g in rows]), 200


@games_bp.route("/live", methods=["GET"])
def live_games():
    """Currently active games for spectators. Optional rating range filter."""
    q = Game.query.filter_by(status="active")
    try:
        min_r = int(request.args.get("min_rating") or 0)
        max_r = int(request.args.get("max_rating") or 0)
    except ValueError:
        min_r = max_r = 0
    rows = q.order_by(Game.last_move_at.desc()).limit(100).all()

    def _in_range(g):
        wr = g.white_user.online_rating if g.white_user else 0
        br = g.black_user.online_rating if g.black_user else 0
        if min_r and max(wr, br) < min_r:
            return False
        if max_r and min(wr, br) > max_r:
            return False
        return True
    rows = [g for g in rows if _in_range(g)]
    return jsonify([_serialize(g) for g in rows]), 200


@games_bp.route("/leaderboard", methods=["GET"])
def leaderboard():
    rows = (User.query.filter(User.is_verified.is_(True), User.games_played > 0)
            .order_by(User.online_rating.desc()).limit(50).all())
    return jsonify([u.public_dict() for u in rows]), 200


@games_bp.route("/<int:game_id>", methods=["GET"])
def get_game(game_id: int):
    g = Game.query.get_or_404(game_id)
    if _enforce_clocks(g):
        db.session.commit()
    return jsonify(_serialize(g)), 200


# --------------------------------------------------------------- user -------

@games_bp.route("", methods=["POST"])
@user_required
@limiter.limit("20 per minute")
def create_challenge():
    data = request.get_json() or {}
    color = (data.get("color") or "random").lower()
    if color not in ("white", "black", "random"):
        color = "random"
    rated = bool(data.get("rated", True))

    try:
        tc = int(data.get("time_control_seconds") or 0)
    except (TypeError, ValueError):
        tc = 0
    if tc < 0 or tc > 60 * 60:
        tc = 0

    try:
        inc = int(data.get("increment_seconds") or 0)
    except (TypeError, ValueError):
        inc = 0
    inc = max(0, min(inc, 60))

    def _opt_int(key):
        v = data.get(key)
        if v in (None, ""):
            return None
        try:
            n = int(v)
        except (TypeError, ValueError):
            return None
        return max(0, min(3500, n))

    min_r = _opt_int("min_opp_rating")
    max_r = _opt_int("max_opp_rating")
    if min_r is not None and max_r is not None and min_r > max_r:
        min_r, max_r = max_r, min_r

    u = current_user()
    existing = Game.query.filter_by(creator_user_id=u.id, status="open").first()
    if existing:
        return jsonify(_serialize(existing)), 200

    g = Game(
        creator_user_id=u.id, creator_color=color, rated=rated,
        time_control_seconds=tc, increment_seconds=inc,
        min_opp_rating=min_r, max_opp_rating=max_r,
        status="open",
    )
    if color == "white":
        g.white_user_id = u.id
    elif color == "black":
        g.black_user_id = u.id
    db.session.add(g)
    db.session.commit()
    return jsonify(_serialize(g)), 201


@games_bp.route("/<int:game_id>/cancel", methods=["POST"])
@user_required
def cancel_challenge(game_id: int):
    g = Game.query.get_or_404(game_id)
    if g.status != "open" or g.creator_user_id != current_user().id:
        return jsonify({"error": "Cannot cancel"}), 400
    g.status = "aborted"
    g.ended_at = datetime.utcnow()
    db.session.commit()
    return jsonify(_serialize(g)), 200


@games_bp.route("/<int:game_id>/accept", methods=["POST"])
@user_required
@limiter.limit("30 per minute")
def accept_challenge(game_id: int):
    u = current_user()
    g = Game.query.get_or_404(game_id)
    if g.status != "open":
        return jsonify({"error": "Challenge is no longer open"}), 400
    if g.creator_user_id == u.id:
        return jsonify({"error": "Cannot accept your own challenge"}), 400

    if g.min_opp_rating is not None and u.online_rating < g.min_opp_rating:
        return jsonify({"error": f"Your rating is below the creator's minimum ({g.min_opp_rating})"}), 403
    if g.max_opp_rating is not None and u.online_rating > g.max_opp_rating:
        return jsonify({"error": f"Your rating is above the creator's maximum ({g.max_opp_rating})"}), 403

    blocked = BlockedUser.query.filter(
        ((BlockedUser.blocker_id == g.creator_user_id) & (BlockedUser.blocked_id == u.id)) |
        ((BlockedUser.blocker_id == u.id) & (BlockedUser.blocked_id == g.creator_user_id))
    ).first()
    if blocked:
        return jsonify({"error": "Cannot accept this challenge"}), 403

    if g.creator_color == "white":
        g.black_user_id = u.id
    elif g.creator_color == "black":
        g.white_user_id = u.id
    else:
        if random.random() < 0.5:
            g.white_user_id = g.creator_user_id
            g.black_user_id = u.id
        else:
            g.black_user_id = g.creator_user_id
            g.white_user_id = u.id

    g.status = "active"
    g.started_at = datetime.utcnow()
    g.last_move_at = datetime.utcnow()
    if g.time_control_seconds:
        g.white_time_remaining = g.time_control_seconds
        g.black_time_remaining = g.time_control_seconds
    g.white_rating_before = g.white_user.online_rating if g.white_user else DEFAULT_ONLINE_RATING
    g.black_rating_before = g.black_user.online_rating if g.black_user else DEFAULT_ONLINE_RATING
    db.session.commit()
    return jsonify(_serialize(g)), 200


@games_bp.route("/<int:game_id>/move", methods=["POST"])
@user_required
@limiter.limit("120 per minute")
def make_move(game_id: int):
    u = current_user()
    g = Game.query.get_or_404(game_id)
    if g.status != "active":
        return jsonify({"error": "Game is not active"}), 400

    if _enforce_clocks(g):
        db.session.commit()
        return jsonify(_serialize(g)), 200

    role = _player_role(g, u)
    if not role:
        return jsonify({"error": "Not a participant"}), 403

    data = request.get_json() or {}
    move_uci = (data.get("move") or "").strip()
    if not move_uci:
        return jsonify({"error": "move (uci) is required"}), 400

    board = _board_from_game(g)
    expected_turn = "white" if board.turn == chess.WHITE else "black"
    if expected_turn != role:
        return jsonify({"error": "Not your turn"}), 400

    try:
        move = chess.Move.from_uci(move_uci)
    except (chess.InvalidMoveError, ValueError):
        return jsonify({"error": "Invalid move format"}), 400
    if move not in board.legal_moves:
        return jsonify({"error": "Illegal move"}), 400

    _consume_clock_for_move(g)

    san = board.san(move)
    move_number_full = (g.move_count // 2) + 1
    if board.turn == chess.WHITE:
        token = f"{move_number_full}. {san}"
    else:
        token = san
    new_pgn = (g.pgn + " " + token).strip() if g.pgn else token

    board.push(move)
    g.fen = board.fen()
    g.pgn = new_pgn
    g.move_count += 1
    g.last_move_at = datetime.utcnow()
    g.draw_offer_by = None

    outcome = board.outcome(claim_draw=True)
    if outcome is not None:
        if outcome.winner is True:
            _apply_result(g, "1-0")
        elif outcome.winner is False:
            _apply_result(g, "0-1")
        else:
            _apply_result(g, "1/2-1/2")

    db.session.commit()
    return jsonify(_serialize(g)), 200


@games_bp.route("/<int:game_id>/resign", methods=["POST"])
@user_required
def resign(game_id: int):
    u = current_user()
    g = Game.query.get_or_404(game_id)
    if g.status != "active":
        return jsonify({"error": "Game is not active"}), 400
    role = _player_role(g, u)
    if not role:
        return jsonify({"error": "Not a participant"}), 403
    _apply_result(g, "0-1" if role == "white" else "1-0")
    db.session.commit()
    return jsonify(_serialize(g)), 200


@games_bp.route("/<int:game_id>/claim-time", methods=["POST"])
@user_required
def claim_time(game_id: int):
    """Participant claims a win on time when opponent has flagged but never moved."""
    g = Game.query.get_or_404(game_id)
    if g.status != "active":
        return jsonify({"error": "Game is not active"}), 400
    if not _player_role(g, current_user()):
        return jsonify({"error": "Not a participant"}), 403
    if _enforce_clocks(g):
        db.session.commit()
        return jsonify(_serialize(g)), 200
    return jsonify({"error": "Opponent has not run out of time"}), 400


@games_bp.route("/<int:game_id>/draw-offer", methods=["POST"])
@user_required
def draw_offer(game_id: int):
    u = current_user()
    g = Game.query.get_or_404(game_id)
    if g.status != "active":
        return jsonify({"error": "Game is not active"}), 400
    if not _player_role(g, u):
        return jsonify({"error": "Not a participant"}), 403
    g.draw_offer_by = u.id
    db.session.commit()
    return jsonify(_serialize(g)), 200


@games_bp.route("/<int:game_id>/draw-accept", methods=["POST"])
@user_required
def draw_accept(game_id: int):
    u = current_user()
    g = Game.query.get_or_404(game_id)
    if g.status != "active" or not g.draw_offer_by:
        return jsonify({"error": "No draw offer"}), 400
    if g.draw_offer_by == u.id or not _player_role(g, u):
        return jsonify({"error": "Cannot accept your own draw offer"}), 400
    _apply_result(g, "1/2-1/2")
    db.session.commit()
    return jsonify(_serialize(g)), 200


@games_bp.route("/draw-decline", methods=["POST"])
@games_bp.route("/<int:game_id>/draw-decline", methods=["POST"])
@user_required
def draw_decline(game_id: int):
    u = current_user()
    g = Game.query.get_or_404(game_id)
    if not _player_role(g, u):
        return jsonify({"error": "Not a participant"}), 403
    g.draw_offer_by = None
    db.session.commit()
    return jsonify(_serialize(g)), 200


@games_bp.route("/me/games", methods=["GET"])
@user_required
def my_games():
    u = current_user()
    status = request.args.get("status")
    q = Game.query.filter(
        (Game.white_user_id == u.id) | (Game.black_user_id == u.id)
        | (Game.creator_user_id == u.id)
    )
    if status == "active":
        q = q.filter(Game.status.in_(["open", "active"]))
    elif status == "finished":
        q = q.filter(Game.status.in_(["white_wins", "black_wins", "draw", "aborted"]))
    rows = q.order_by(Game.created_at.desc()).limit(50).all()
    return jsonify([_serialize(g) for g in rows]), 200


# ----------------------------------------------------------------- chat ----

_URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)


def _sanitize_chat(text: str) -> str:
    text = text.strip()
    if len(text) > 500:
        text = text[:500]
    text = _URL_RE.sub("[link removed]", text)
    return text


@games_bp.route("/<int:game_id>/chat", methods=["GET"])
def get_chat(game_id: int):
    g = Game.query.get_or_404(game_id)
    rows = (GameMessage.query.filter_by(game_id=g.id)
            .order_by(GameMessage.created_at.asc()).limit(200).all())
    return jsonify([m.to_dict() for m in rows]), 200


@games_bp.route("/<int:game_id>/chat", methods=["POST"])
@user_required
@limiter.limit("20 per minute")
def post_chat(game_id: int):
    u = current_user()
    g = Game.query.get_or_404(game_id)
    if g.chat_disabled:
        return jsonify({"error": "Chat is disabled for this game"}), 403
    if u.chat_muted:
        return jsonify({"error": "You are muted from chat"}), 403
    if not _player_role(g, u):
        return jsonify({"error": "Only participants can chat in this game"}), 403

    data = request.get_json() or {}
    content = _sanitize_chat(data.get("content") or "")
    if not content:
        return jsonify({"error": "Message is empty"}), 400

    m = GameMessage(game_id=g.id, user_id=u.id, content=content)
    db.session.add(m)
    db.session.commit()
    return jsonify(m.to_dict()), 201


# -------------------------------------------------------------- admin ------

@games_bp.route("/admin/games", methods=["GET"])
@_admin_required
def admin_list_games():
    """Paginated games list. ?status=open|active|finished|voided|all&search=&page=&per_page="""
    status = (request.args.get("status") or "all").lower()
    q = Game.query
    if status == "open":
        q = q.filter_by(status="open")
    elif status == "active":
        q = q.filter_by(status="active")
    elif status == "finished":
        q = q.filter(Game.status.in_(["white_wins", "black_wins", "draw"]))
    elif status == "voided":
        q = q.filter(Game.voided_by_admin_id.isnot(None))

    search = (request.args.get("search") or "").strip()
    if search:
        like = f"%{search}%"
        q = q.outerjoin(User, (User.id == Game.white_user_id) | (User.id == Game.black_user_id))\
             .filter((User.username.like(like)) | (User.display_name.like(like)))\
             .distinct()

    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(5, int(request.args.get("per_page", 25))))
    except ValueError:
        page, per_page = 1, 25

    pagination = q.order_by(Game.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        "games": [_serialize(g) for g in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
        "per_page": pagination.per_page,
    }), 200


@games_bp.route("/admin/games/<int:game_id>/abort", methods=["POST"])
@_admin_required
def admin_abort_game(game_id: int):
    g = Game.query.get_or_404(game_id)
    if g.status in ("white_wins", "black_wins", "draw"):
        return jsonify({"error": "Game already finished"}), 400
    data = request.get_json() or {}
    g.status = "aborted"
    g.ended_at = datetime.utcnow()
    g.void_reason = (data.get("reason") or "").strip()[:500] or None
    try:
        g.voided_by_admin_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        pass
    db.session.commit()
    return jsonify(_serialize(g)), 200


@games_bp.route("/admin/games/<int:game_id>/void", methods=["POST"])
@_admin_required
def admin_void_game(game_id: int):
    """Void a finished game; reverts ratings if rated."""
    g = Game.query.get_or_404(game_id)
    if g.status not in ("white_wins", "black_wins", "draw"):
        return jsonify({"error": "Only finished games can be voided"}), 400
    if g.voided_by_admin_id is not None:
        return jsonify({"error": "Already voided"}), 400

    if g.rated and g.white_user and g.black_user and \
       g.white_rating_after is not None and g.black_rating_after is not None and \
       g.white_rating_before is not None and g.black_rating_before is not None:
        d_white = g.white_rating_after - g.white_rating_before
        d_black = g.black_rating_after - g.black_rating_before
        g.white_user.online_rating -= d_white
        g.black_user.online_rating -= d_black
        if g.result == "1-0":
            g.white_user.games_won = max(0, g.white_user.games_won - 1)
            g.black_user.games_lost = max(0, g.black_user.games_lost - 1)
        elif g.result == "0-1":
            g.black_user.games_won = max(0, g.black_user.games_won - 1)
            g.white_user.games_lost = max(0, g.white_user.games_lost - 1)
        else:
            g.white_user.games_drawn = max(0, g.white_user.games_drawn - 1)
            g.black_user.games_drawn = max(0, g.black_user.games_drawn - 1)
        g.white_user.games_played = max(0, g.white_user.games_played - 1)
        g.black_user.games_played = max(0, g.black_user.games_played - 1)

    data = request.get_json() or {}
    g.void_reason = (data.get("reason") or "").strip()[:500] or None
    try:
        g.voided_by_admin_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        pass
    db.session.commit()
    return jsonify(_serialize(g)), 200


@games_bp.route("/admin/games/<int:game_id>/chat-toggle", methods=["POST"])
@_admin_required
def admin_chat_toggle(game_id: int):
    g = Game.query.get_or_404(game_id)
    g.chat_disabled = not g.chat_disabled
    db.session.commit()
    return jsonify(_serialize(g)), 200


@games_bp.route("/admin/messages/<int:msg_id>", methods=["DELETE"])
@_admin_required
def admin_delete_message(msg_id: int):
    m = GameMessage.query.get_or_404(msg_id)
    m.is_deleted = True
    try:
        m.deleted_by_admin_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        pass
    db.session.commit()
    return jsonify(m.to_dict()), 200


@games_bp.route("/admin/messages", methods=["GET"])
@_admin_required
def admin_list_messages():
    """Recent game-chat messages across all games for moderation."""
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(5, int(request.args.get("per_page", 50))))
    except ValueError:
        page, per_page = 1, 50

    q = GameMessage.query
    only = (request.args.get("only") or "all").lower()
    if only == "active":
        q = q.filter_by(is_deleted=False)
    elif only == "deleted":
        q = q.filter_by(is_deleted=True)

    search = (request.args.get("search") or "").strip()
    if search:
        q = q.filter(GameMessage.content.like(f"%{search}%"))

    pagination = q.order_by(GameMessage.created_at.desc())\
                  .paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({
        "messages": [m.to_dict() for m in pagination.items],
        "total": pagination.total,
        "page": pagination.page,
        "pages": pagination.pages,
    }), 200
