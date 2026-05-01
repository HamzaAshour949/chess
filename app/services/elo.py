"""Elo rating calculation for the platform's online games.

K-factor schedule (FIDE-inspired):
  - Provisional (< 10 games):       K = 40
  - Established, rating < 2400:     K = 20
  - Established, rating >= 2400:    K = 10
"""
from __future__ import annotations


def k_factor(rating: int, games_played: int) -> int:
    if games_played < 10:
        return 40
    if rating >= 2400:
        return 10
    return 20


def expected_score(rating_a: int, rating_b: int) -> float:
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))


def calc_new_ratings(white_rating: int, black_rating: int,
                     white_games: int, black_games: int,
                     result: str) -> tuple[int, int]:
    """Compute new ratings after a game.

    `result` is "1-0" (white wins), "0-1" (black wins), or "1/2-1/2" (draw).
    Returns (new_white, new_black).
    """
    if result == "1-0":
        s_white, s_black = 1.0, 0.0
    elif result == "0-1":
        s_white, s_black = 0.0, 1.0
    else:
        s_white, s_black = 0.5, 0.5

    e_white = expected_score(white_rating, black_rating)
    e_black = 1.0 - e_white

    k_w = k_factor(white_rating, white_games)
    k_b = k_factor(black_rating, black_games)

    new_white = round(white_rating + k_w * (s_white - e_white))
    new_black = round(black_rating + k_b * (s_black - e_black))
    return int(new_white), int(new_black)
