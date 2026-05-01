from datetime import datetime
import secrets
from app import db
from werkzeug.security import generate_password_hash, check_password_hash


# Default starting Elo for new platform players
DEFAULT_ONLINE_RATING = 1200
PROVISIONAL_GAMES = 10  # K-factor differs while provisional


class Admin(db.Model):
    __tablename__ = "admins"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "created_at": self.created_at.isoformat(),
        }


class Player(db.Model):
    __tablename__ = "players"

    id = db.Column(db.Integer, primary_key=True)
    name_en = db.Column(db.String(200), nullable=False)
    name_ar = db.Column(db.String(200), nullable=False)
    bio_en = db.Column(db.Text, nullable=True)
    bio_ar = db.Column(db.Text, nullable=True)
    country = db.Column(db.String(100), nullable=True)
    rating = db.Column(db.Integer, nullable=True)
    title = db.Column(db.String(20), nullable=True)  # GM, IM, FM, etc.
    image_url = db.Column(db.String(500), nullable=True)
    date_of_birth = db.Column(db.Date, nullable=True)
    is_player_of_month = db.Column(db.Boolean, default=False)
    is_tournament_winner = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    news = db.relationship("News", backref="player", lazy="dynamic")

    def to_dict(self, lang="en"):
        return {
            "id": self.id,
            "name": self.name_en if lang == "en" else self.name_ar,
            "name_en": self.name_en,
            "name_ar": self.name_ar,
            "bio": self.bio_en if lang == "en" else self.bio_ar,
            "bio_en": self.bio_en,
            "bio_ar": self.bio_ar,
            "country": self.country,
            "rating": self.rating,
            "title": self.title,
            "image_url": self.image_url,
            "date_of_birth": self.date_of_birth.isoformat() if self.date_of_birth else None,
            "is_player_of_month": self.is_player_of_month,
            "is_tournament_winner": self.is_tournament_winner,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class SiteString(db.Model):
    __tablename__ = "site_strings"

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(200), nullable=False)
    lang = db.Column(db.String(10), nullable=False, default="en")
    value = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("key", "lang", name="uq_key_lang"),
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    def to_dict(self):
        return {
            "id": self.id,
            "key": self.key,
            "lang": self.lang,
            "value": self.value,
        }


class News(db.Model):
    __tablename__ = "news"

    id = db.Column(db.Integer, primary_key=True)
    title_en = db.Column(db.String(500), nullable=True)
    title_ar = db.Column(db.String(500), nullable=True)
    content_en = db.Column(db.Text, nullable=True)
    content_ar = db.Column(db.Text, nullable=True)
    region = db.Column(db.String(10), nullable=False, default="both")  # 'en', 'ar', 'both'
    image_url = db.Column(db.String(500), nullable=True)
    published = db.Column(db.Boolean, default=False)
    is_featured = db.Column(db.Boolean, default=False)
    published_at = db.Column(db.DateTime, nullable=True)
    player_id = db.Column(db.Integer, db.ForeignKey("players.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, lang="en"):
        return {
            "id": self.id,
            "title": self.title_en if lang == "en" else self.title_ar,
            "title_en": self.title_en,
            "title_ar": self.title_ar,
            "content": self.content_en if lang == "en" else self.content_ar,
            "content_en": self.content_en,
            "content_ar": self.content_ar,
            "region": self.region,
            "image_url": self.image_url,
            "published": self.published,
            "is_featured": self.is_featured,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "player_id": self.player_id,
            "player_name": (
                self.player.name_en if lang == "en" else self.player.name_ar
            ) if self.player else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class User(db.Model):
    """End-user accounts that can play games on the platform.

    Separate from Admin. Users can optionally request linking their account
    to an existing Player profile (which is admin-managed FIDE-style data).
    The link grants identity association only — users cannot edit Player rows.
    """

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(60), unique=True, nullable=False, index=True)
    email = db.Column(db.String(190), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    display_name = db.Column(db.String(120), nullable=True)
    avatar_url = db.Column(db.String(500), nullable=True)
    country = db.Column(db.String(100), nullable=True)

    # Email verification (OTP)
    is_verified = db.Column(db.Boolean, default=False, nullable=False, index=True)
    otp_code = db.Column(db.String(10), nullable=True)
    otp_expires_at = db.Column(db.DateTime, nullable=True)
    otp_attempts = db.Column(db.Integer, default=0, nullable=False)
    otp_last_sent_at = db.Column(db.DateTime, nullable=True)

    # Online rating system (Elo-like) — separate from Player.rating
    online_rating = db.Column(db.Integer, default=DEFAULT_ONLINE_RATING, nullable=False, index=True)
    games_played = db.Column(db.Integer, default=0, nullable=False)
    games_won = db.Column(db.Integer, default=0, nullable=False)
    games_lost = db.Column(db.Integer, default=0, nullable=False)
    games_drawn = db.Column(db.Integer, default=0, nullable=False)

    # Player profile link (admin-approved one-way link). Read-only from user.
    linked_player_id = db.Column(db.Integer, db.ForeignKey("players.id"), nullable=True, index=True)
    linked_player = db.relationship("Player", foreign_keys=[linked_player_id])

    # Moderation (admin-managed)
    is_banned = db.Column(db.Boolean, default=False, nullable=False, index=True)
    banned_at = db.Column(db.DateTime, nullable=True)
    ban_reason = db.Column(db.Text, nullable=True)
    chat_muted = db.Column(db.Boolean, default=False, nullable=False)  # admin-imposed chat mute

    # Notification & privacy preferences (user-managed)
    notif_email = db.Column(db.Boolean, default=True, nullable=False)
    notif_dm = db.Column(db.Boolean, default=True, nullable=False)
    notif_game_chat = db.Column(db.Boolean, default=True, nullable=False)
    notif_sound = db.Column(db.Boolean, default=True, nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    @property
    def is_provisional(self) -> bool:
        return self.games_played < PROVISIONAL_GAMES

    def public_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "display_name": self.display_name or self.username,
            "avatar_url": self.avatar_url,
            "country": self.country,
            "online_rating": self.online_rating,
            "games_played": self.games_played,
            "games_won": self.games_won,
            "games_lost": self.games_lost,
            "games_drawn": self.games_drawn,
            "is_provisional": self.is_provisional,
            "linked_player_id": self.linked_player_id,
            "linked_player_name": (
                self.linked_player.name_en if self.linked_player else None
            ),
            "linked_player_title": self.linked_player.title if self.linked_player else None,
            "is_banned": self.is_banned,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def private_dict(self) -> dict:
        d = self.public_dict()
        d.update({
            "email": self.email,
            "is_verified": self.is_verified,
            "banned_at": self.banned_at.isoformat() if self.banned_at else None,
            "ban_reason": self.ban_reason,
            "chat_muted": self.chat_muted,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
            "notif_email": self.notif_email,
            "notif_dm": self.notif_dm,
            "notif_game_chat": self.notif_game_chat,
            "notif_sound": self.notif_sound,
        })
        return d


class LinkRequest(db.Model):
    """A user's request to link their account to a Player profile.

    Created by the user, approved/rejected by an admin. Only when status
    becomes 'approved' is the User.linked_player_id field set.
    """

    __tablename__ = "link_requests"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    player_id = db.Column(db.Integer, db.ForeignKey("players.id"), nullable=False, index=True)
    message = db.Column(db.Text, nullable=True)  # user-supplied evidence
    status = db.Column(db.String(20), default="pending", nullable=False, index=True)
    # pending | approved | rejected
    admin_note = db.Column(db.Text, nullable=True)
    reviewed_by_admin_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", backref=db.backref("link_requests", lazy="dynamic"))
    player = db.relationship("Player")

    __table_args__ = (
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    def to_dict(self, lang: str = "en") -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "user": self.user.public_dict() if self.user else None,
            "player_id": self.player_id,
            "player": self.player.to_dict(lang) if self.player else None,
            "message": self.message,
            "status": self.status,
            "admin_note": self.admin_note,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Game(db.Model):
    """A chess game between two registered users.

    Server-authoritative: every move is validated server-side using
    python-chess; FEN/PGN are persisted as the source of truth.
    """

    __tablename__ = "games"

    id = db.Column(db.Integer, primary_key=True)

    white_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
    black_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)

    # Open-challenge phase: only `creator_user_id` set, color preference noted
    creator_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    creator_color = db.Column(db.String(6), default="random", nullable=False)
    # white | black | random

    # Game state
    status = db.Column(db.String(20), default="open", nullable=False, index=True)
    # open | active | white_wins | black_wins | draw | aborted
    result = db.Column(db.String(10), nullable=True)  # 1-0 | 0-1 | 1/2-1/2

    fen = db.Column(db.String(120), nullable=False,
                    default="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
    pgn = db.Column(db.Text, nullable=False, default="")
    move_count = db.Column(db.Integer, default=0, nullable=False)

    # Time control (simple per-side seconds budget; 0 = unlimited / casual)
    time_control_seconds = db.Column(db.Integer, default=0, nullable=False)
    increment_seconds = db.Column(db.Integer, default=0, nullable=False)  # Fischer increment
    white_time_remaining = db.Column(db.Integer, nullable=True)
    black_time_remaining = db.Column(db.Integer, nullable=True)
    rated = db.Column(db.Boolean, default=True, nullable=False)

    # Opponent rating constraints (creator-imposed; nullable = unrestricted)
    min_opp_rating = db.Column(db.Integer, nullable=True)
    max_opp_rating = db.Column(db.Integer, nullable=True)

    # Rating snapshot for the result page
    white_rating_before = db.Column(db.Integer, nullable=True)
    black_rating_before = db.Column(db.Integer, nullable=True)
    white_rating_after = db.Column(db.Integer, nullable=True)
    black_rating_after = db.Column(db.Integer, nullable=True)

    draw_offer_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    # Admin moderation
    chat_disabled = db.Column(db.Boolean, default=False, nullable=False)
    voided_by_admin_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=True)
    void_reason = db.Column(db.Text, nullable=True)

    started_at = db.Column(db.DateTime, nullable=True)
    last_move_at = db.Column(db.DateTime, nullable=True)
    ended_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    white_user = db.relationship("User", foreign_keys=[white_user_id])
    black_user = db.relationship("User", foreign_keys=[black_user_id])
    creator = db.relationship("User", foreign_keys=[creator_user_id])

    __table_args__ = (
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "status": self.status,
            "result": self.result,
            "fen": self.fen,
            "pgn": self.pgn,
            "move_count": self.move_count,
            "time_control_seconds": self.time_control_seconds,
            "increment_seconds": self.increment_seconds,
            "white_time_remaining": self.white_time_remaining,
            "black_time_remaining": self.black_time_remaining,
            "rated": self.rated,
            "min_opp_rating": self.min_opp_rating,
            "max_opp_rating": self.max_opp_rating,
            "chat_disabled": self.chat_disabled,
            "voided": self.voided_by_admin_id is not None,
            "void_reason": self.void_reason,
            "creator_color": self.creator_color,
            "creator_user_id": self.creator_user_id,
            "white_user": self.white_user.public_dict() if self.white_user else None,
            "black_user": self.black_user.public_dict() if self.black_user else None,
            "white_rating_before": self.white_rating_before,
            "black_rating_before": self.black_rating_before,
            "white_rating_after": self.white_rating_after,
            "black_rating_after": self.black_rating_after,
            "draw_offer_by": self.draw_offer_by,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "last_move_at": self.last_move_at.isoformat() if self.last_move_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class GameMessage(db.Model):
    """Chat message inside a single game (between the two participants).

    Spectators can read messages by default but cannot post.
    """

    __tablename__ = "game_messages"

    id = db.Column(db.Integer, primary_key=True)
    game_id = db.Column(db.Integer, db.ForeignKey("games.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    content = db.Column(db.String(500), nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False, index=True)
    deleted_by_admin_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    user = db.relationship("User", foreign_keys=[user_id])
    game = db.relationship("Game", backref=db.backref("messages", lazy="dynamic"))

    __table_args__ = (
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "game_id": self.game_id,
            "user_id": self.user_id,
            "username": self.user.username if self.user else None,
            "display_name": (self.user.display_name or self.user.username) if self.user else None,
            "content": "[deleted by admin]" if self.is_deleted else self.content,
            "is_deleted": self.is_deleted,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class DirectMessage(db.Model):
    """Private one-to-one message between two users (outside any game)."""

    __tablename__ = "direct_messages"

    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    content = db.Column(db.String(2000), nullable=False)
    is_read = db.Column(db.Boolean, default=False, nullable=False, index=True)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    deleted_by_admin_id = db.Column(db.Integer, db.ForeignKey("admins.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    sender = db.relationship("User", foreign_keys=[sender_id])
    recipient = db.relationship("User", foreign_keys=[recipient_id])

    __table_args__ = (
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )

    def to_dict(self, viewer_id: int | None = None) -> dict:
        return {
            "id": self.id,
            "sender_id": self.sender_id,
            "recipient_id": self.recipient_id,
            "sender": self.sender.public_dict() if self.sender else None,
            "recipient": self.recipient.public_dict() if self.recipient else None,
            "content": "[deleted by admin]" if self.is_deleted else self.content,
            "is_deleted": self.is_deleted,
            "is_read": self.is_read,
            "is_mine": viewer_id is not None and self.sender_id == viewer_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class BlockedUser(db.Model):
    """User-to-user block list. Blocking prevents DMs and challenge accept."""

    __tablename__ = "blocked_users"

    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    blocked_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("blocker_id", "blocked_id", name="uq_blocker_blocked"),
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )
