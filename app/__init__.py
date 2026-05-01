import os
from flask import Flask, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
limiter = Limiter(key_func=get_remote_address)

FRONTEND_DIST = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist"
)


def create_app():
    app = Flask(__name__)
    app.config.from_object("config.Config")

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    limiter.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Security headers (CSP, HSTS, etc.)
    # force_https=False for local dev; set True behind a reverse proxy in prod
    Talisman(
        app,
        force_https=False,
        content_security_policy=None,  # frontend is served from same origin
        session_cookie_secure=app.config.get("SESSION_COOKIE_SECURE", False),
    )

    from app.routes.auth import auth_bp
    from app.routes.players import players_bp
    from app.routes.news import news_bp
    from app.routes.upload import upload_bp
    from app.routes.site_strings import strings_bp
    from app.routes.user_auth import user_auth_bp
    from app.routes.games import games_bp
    from app.routes.links import links_bp
    from app.routes.messages import messages_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(players_bp, url_prefix="/api/players")
    app.register_blueprint(news_bp, url_prefix="/api/news")
    app.register_blueprint(upload_bp, url_prefix="/api/upload")
    app.register_blueprint(strings_bp, url_prefix="/api/strings")
    app.register_blueprint(user_auth_bp, url_prefix="/api/users/auth")
    app.register_blueprint(games_bp, url_prefix="/api/games")
    app.register_blueprint(links_bp, url_prefix="/api/links")
    app.register_blueprint(messages_bp, url_prefix="/api/messages")

    @app.route("/uploads/<path:filename>")
    def uploaded_file(filename):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        dist = os.path.abspath(FRONTEND_DIST)
        full = os.path.join(dist, path)
        if path and os.path.isfile(full):
            return send_from_directory(dist, path)
        return send_from_directory(dist, "index.html")

    return app
