from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.models import Player
from app import db

players_bp = Blueprint("players", __name__)


@players_bp.route("", methods=["GET"])
def get_players():
    lang = request.args.get("lang", "en")
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 12, type=int)
    search = request.args.get("search", "")

    query = Player.query
    if search:
        query = query.filter(
            db.or_(
                Player.name_en.ilike(f"%{search}%"),
                Player.name_ar.ilike(f"%{search}%"),
            )
        )

    query = query.order_by(db.case((Player.rating.is_(None), 1), else_=0), Player.rating.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        "players": [p.to_dict(lang) for p in pagination.items],
        "total": pagination.total,
        "pages": pagination.pages,
        "current_page": page,
    }), 200


@players_bp.route("/<int:player_id>", methods=["GET"])
def get_player(player_id):
    lang = request.args.get("lang", "en")
    player = Player.query.get_or_404(player_id)
    return jsonify(player.to_dict(lang)), 200


@players_bp.route("", methods=["POST"])
@jwt_required()
def create_player():
    data = request.get_json()
    if not data or not data.get("name_en") or not data.get("name_ar"):
        return jsonify({"error": "name_en and name_ar are required"}), 400

    player = Player(
        name_en=data["name_en"],
        name_ar=data["name_ar"],
        bio_en=data.get("bio_en"),
        bio_ar=data.get("bio_ar"),
        country=data.get("country"),
        rating=data.get("rating"),
        title=data.get("title"),
        image_url=data.get("image_url"),
        date_of_birth=data.get("date_of_birth"),
    )
    db.session.add(player)
    db.session.commit()
    return jsonify(player.to_dict()), 201


@players_bp.route("/<int:player_id>", methods=["PUT"])
@jwt_required()
def update_player(player_id):
    player = Player.query.get_or_404(player_id)
    data = request.get_json()

    for field in ["name_en", "name_ar", "bio_en", "bio_ar", "country", "rating", "title", "image_url", "date_of_birth"]:
        if field in data:
            setattr(player, field, data[field])

    db.session.commit()
    return jsonify(player.to_dict()), 200


@players_bp.route("/<int:player_id>", methods=["DELETE"])
@jwt_required()
def delete_player(player_id):
    player = Player.query.get_or_404(player_id)
    db.session.delete(player)
    db.session.commit()
    return jsonify({"message": "Player deleted"}), 200
