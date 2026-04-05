from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.models import News
from app import db

news_bp = Blueprint("news", __name__)


@news_bp.route("", methods=["GET"])
def get_news():
    lang = request.args.get("lang", "en")
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 10, type=int)
    player_id = request.args.get("player_id", type=int)

    query = News.query.filter_by(published=True)

    # Filter by region: show news for 'both' + the requested lang
    query = query.filter(db.or_(News.region == lang, News.region == "both"))

    if player_id:
        query = query.filter_by(player_id=player_id)

    query = query.order_by(db.case((News.published_at.is_(None), 1), else_=0), News.published_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "news": [n.to_dict(lang) for n in pagination.items],
        "total": pagination.total,
        "pages": pagination.pages,
        "current_page": page,
    }), 200


@news_bp.route("/<int:news_id>", methods=["GET"])
def get_news_item(news_id):
    lang = request.args.get("lang", "en")
    news = News.query.get_or_404(news_id)
    return jsonify(news.to_dict(lang)), 200


@news_bp.route("/admin", methods=["GET"])
@jwt_required()
def get_all_news_admin():
    """Get all news for admin (including unpublished)."""
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 10, type=int)

    query = News.query.order_by(News.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "news": [n.to_dict("en") for n in pagination.items],
        "total": pagination.total,
        "pages": pagination.pages,
        "current_page": page,
    }), 200


@news_bp.route("", methods=["POST"])
@jwt_required()
def create_news():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    news = News(
        title_en=data.get("title_en"),
        title_ar=data.get("title_ar"),
        content_en=data.get("content_en"),
        content_ar=data.get("content_ar"),
        region=data.get("region", "both"),
        image_url=data.get("image_url"),
        published=data.get("published", False),
        published_at=datetime.utcnow() if data.get("published") else None,
        player_id=data.get("player_id"),
    )
    db.session.add(news)
    db.session.commit()
    return jsonify(news.to_dict()), 201


@news_bp.route("/<int:news_id>", methods=["PUT"])
@jwt_required()
def update_news(news_id):
    news = News.query.get_or_404(news_id)
    data = request.get_json()

    for field in ["title_en", "title_ar", "content_en", "content_ar", "region", "image_url", "player_id"]:
        if field in data:
            setattr(news, field, data[field])

    if "published" in data:
        was_published = news.published
        news.published = data["published"]
        if data["published"] and not was_published:
            news.published_at = datetime.utcnow()

    db.session.commit()
    return jsonify(news.to_dict()), 200


@news_bp.route("/<int:news_id>", methods=["DELETE"])
@jwt_required()
def delete_news(news_id):
    news = News.query.get_or_404(news_id)
    db.session.delete(news)
    db.session.commit()
    return jsonify({"message": "News deleted"}), 200
