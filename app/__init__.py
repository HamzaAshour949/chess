import os
from flask import Flask, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()

FRONTEND_DIST = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist"
)


def create_app():
    app = Flask(
        __name__,
        static_folder=os.path.abspath(FRONTEND_DIST),
        static_url_path="",
    )
    app.config.from_object("config.Config")

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    from app.routes.auth import auth_bp
    from app.routes.players import players_bp
    from app.routes.news import news_bp
    from app.routes.upload import upload_bp
    from app.routes.site_strings import strings_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(players_bp, url_prefix="/api/players")
    app.register_blueprint(news_bp, url_prefix="/api/news")
    app.register_blueprint(upload_bp, url_prefix="/api/upload")
    app.register_blueprint(strings_bp, url_prefix="/api/strings")

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
