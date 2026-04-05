from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from app.models import SiteString
from app import db

strings_bp = Blueprint("strings", __name__)


@strings_bp.route("", methods=["GET"])
def get_strings():
    """Get all site strings, optionally filtered by lang."""
    lang = request.args.get("lang")
    query = SiteString.query
    if lang:
        query = query.filter_by(lang=lang)
    strings = query.all()

    # Return as a dict grouped by lang: { en: {key: value}, ar: {key: value} }
    result = {}
    for s in strings:
        if s.lang not in result:
            result[s.lang] = {}
        result[s.lang][s.key] = s.value

    return jsonify(result), 200


@strings_bp.route("/all", methods=["GET"])
@jwt_required()
def get_all_strings():
    """Get all site strings as a flat list for admin editing."""
    strings = SiteString.query.order_by(SiteString.key, SiteString.lang).all()
    return jsonify([s.to_dict() for s in strings]), 200


@strings_bp.route("/bulk", methods=["PUT"])
@jwt_required()
def update_strings_bulk():
    """Bulk update site strings. Expects { strings: [{key, lang, value}, ...] }"""
    data = request.get_json()
    if not data or "strings" not in data:
        return jsonify({"error": "No strings provided"}), 400

    for item in data["strings"]:
        key = item.get("key")
        lang = item.get("lang")
        value = item.get("value", "")
        if not key or not lang:
            continue

        existing = SiteString.query.filter_by(key=key, lang=lang).first()
        if existing:
            existing.value = value
        else:
            db.session.add(SiteString(key=key, lang=lang, value=value))

    db.session.commit()
    return jsonify({"message": "Strings updated"}), 200


@strings_bp.route("", methods=["POST"])
@jwt_required()
def create_string():
    """Create a new site string key (both languages)."""
    data = request.get_json()
    key = data.get("key", "").strip()
    value_en = data.get("value_en", "")
    value_ar = data.get("value_ar", "")

    if not key:
        return jsonify({"error": "Key is required"}), 400

    existing = SiteString.query.filter_by(key=key, lang="en").first()
    if existing:
        return jsonify({"error": "Key already exists"}), 400

    db.session.add(SiteString(key=key, lang="en", value=value_en))
    db.session.add(SiteString(key=key, lang="ar", value=value_ar))
    db.session.commit()
    return jsonify({"message": "String created"}), 201


@strings_bp.route("/<string:key>", methods=["DELETE"])
@jwt_required()
def delete_string(key):
    """Delete a site string key (both languages)."""
    SiteString.query.filter_by(key=key).delete()
    db.session.commit()
    return jsonify({"message": "String deleted"}), 200
