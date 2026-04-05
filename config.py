import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", os.urandom(32).hex())
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "sqlite:///" + os.path.join(os.path.dirname(os.path.abspath(__file__)), "chess_players.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", os.urandom(32).hex())
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB
