from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from app.models import Admin
from app import db

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data or not data.get("username") or not data.get("password"):
        return jsonify({"error": "Username and password are required"}), 400

    admin = Admin.query.filter_by(username=data["username"]).first()
    if not admin or not admin.check_password(data["password"]):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_access_token(identity=str(admin.id))
    return jsonify({"token": token, "admin": admin.to_dict()}), 200


@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    admin_id = get_jwt_identity()
    admin = Admin.query.get(int(admin_id))
    if not admin:
        return jsonify({"error": "Admin not found"}), 404
    return jsonify(admin.to_dict()), 200


@auth_bp.route("/setup", methods=["POST"])
def setup():
    """Create initial admin account if none exists."""
    if Admin.query.count() > 0:
        return jsonify({"error": "Admin already exists"}), 400

    data = request.get_json()
    if not data or not data.get("username") or not data.get("password") or not data.get("email"):
        return jsonify({"error": "Username, email, and password are required"}), 400

    admin = Admin(username=data["username"], email=data["email"])
    admin.set_password(data["password"])
    db.session.add(admin)
    db.session.commit()

    token = create_access_token(identity=str(admin.id))
    return jsonify({"token": token, "admin": admin.to_dict()}), 201
