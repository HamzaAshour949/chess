from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.models import Player
from app import db

players_bp = Blueprint("players", __name__)


@players_bp.route("/homepage", methods=["GET"])
def get_homepage_players():
    """Get player of the month and tournament winner for the homepage."""
    lang = request.args.get("lang", "en")
    potm = Player.query.filter_by(is_player_of_month=True).first()
    tw = Player.query.filter_by(is_tournament_winner=True).first()
    return jsonify({
        "player_of_month": potm.to_dict(lang) if potm else None,
        "tournament_winner": tw.to_dict(lang) if tw else None,
    }), 200


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
        is_player_of_month=data.get("is_player_of_month", False),
        is_tournament_winner=data.get("is_tournament_winner", False),
    )
    # Ensure only one player has each flag
    if player.is_player_of_month:
        Player.query.filter(Player.is_player_of_month == True).update({"is_player_of_month": False})
    if player.is_tournament_winner:
        Player.query.filter(Player.is_tournament_winner == True).update({"is_tournament_winner": False})
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

    if "is_player_of_month" in data:
        if data["is_player_of_month"]:
            Player.query.filter(Player.id != player_id, Player.is_player_of_month == True).update({"is_player_of_month": False})
        player.is_player_of_month = data["is_player_of_month"]

    if "is_tournament_winner" in data:
        if data["is_tournament_winner"]:
            Player.query.filter(Player.id != player_id, Player.is_tournament_winner == True).update({"is_tournament_winner": False})
        player.is_tournament_winner = data["is_tournament_winner"]

    db.session.commit()
    return jsonify(player.to_dict()), 200


@players_bp.route("/<int:player_id>", methods=["DELETE"])
@jwt_required()
def delete_player(player_id):
    player = Player.query.get_or_404(player_id)
    db.session.delete(player)
    db.session.commit()
    return jsonify({"message": "Player deleted"}), 200
