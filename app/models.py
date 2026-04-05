from datetime import datetime
from app import db
from werkzeug.security import generate_password_hash, check_password_hash


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
