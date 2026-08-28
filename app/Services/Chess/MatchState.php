<?php

declare(strict_types=1);

namespace App\Services\Chess;

use InvalidArgumentException;

/**
 * A game replayed from its move list.
 *
 * The stored UCI move list is the single source of truth for a game: FEN, PGN
 * and the move count are all derived from it. Replaying is what makes
 * threefold repetition detectable without persisting a position table, and it
 * means a corrupted cached FEN can never let an illegal position stand.
 *
 * Replaying a 200-ply game costs well under a millisecond, so this runs on
 * every move request.
 */
final class MatchState
{
    private Position $position;

    /** @var list<string> */
    private array $uciMoves = [];

    /** @var list<string> */
    private array $sanMoves = [];

    /** @var array<string,int> */
    private array $repetitions = [];

    private function __construct(private readonly string $startFen)
    {
        $this->position = Position::fromFen($startFen);
        $this->repetitions[$this->position->repetitionKey()] = 1;
    }

    public static function fresh(string $startFen = Position::START_FEN): self
    {
        return new self($startFen);
    }

    /**
     * Rebuild a game from its space-separated UCI move list.
     *
     * @throws IllegalMoveException when the stored history is not playable
     */
    public static function replay(?string $uciMoves, string $startFen = Position::START_FEN): self
    {
        $state = new self($startFen);

        foreach (self::splitMoves($uciMoves) as $uci) {
            $state->play($uci);
        }

        return $state;
    }

    /** @return list<string> */
    public static function splitMoves(?string $uciMoves): array
    {
        $trimmed = trim((string) $uciMoves);

        return $trimmed === '' ? [] : preg_split('/\s+/', $trimmed);
    }

    /** @throws IllegalMoveException */
    public function play(string $uci): Move
    {
        if ($this->outcome() !== null) {
            throw new IllegalMoveException('The game has already finished.');
        }

        $move = $this->position->moveFromUci($uci);
        if ($move === null) {
            throw new IllegalMoveException("Illegal move: {$uci}");
        }

        $this->sanMoves[] = $this->position->san($move);
        $this->position->makeMove($move);
        $this->uciMoves[] = $move->uci();

        $key = $this->position->repetitionKey();
        $this->repetitions[$key] = ($this->repetitions[$key] ?? 0) + 1;

        return $move;
    }

    public function position(): Position
    {
        return $this->position;
    }

    public function fen(): string
    {
        return $this->position->fen();
    }

    public function turn(): string
    {
        return $this->position->turn() === Position::WHITE ? 'white' : 'black';
    }

    public function moveCount(): int
    {
        return count($this->uciMoves);
    }

    public function uciMoves(): string
    {
        return implode(' ', $this->uciMoves);
    }

    /** @return list<string> */
    public function sanMoves(): array
    {
        return $this->sanMoves;
    }

    /** Movetext only — the API exposes the header-less form the SPA renders. */
    public function pgn(): string
    {
        $out = [];
        $fullmove = Position::fromFen($this->startFen)->fullmoveNumber();
        $blackToStart = Position::fromFen($this->startFen)->turn() === Position::BLACK;

        foreach ($this->sanMoves as $i => $san) {
            if ($blackToStart) {
                if ($i === 0) {
                    $out[] = $fullmove.'...';
                } elseif ($i % 2 === 1) {
                    $out[] = (++$fullmove).'.';
                }
            } elseif ($i % 2 === 0) {
                $out[] = ($fullmove + intdiv($i, 2)).'.';
            }
            $out[] = $san;
        }

        return implode(' ', $out);
    }

    /** @return list<string> */
    public function legalMovesUci(): array
    {
        return array_map(fn (Move $m) => $m->uci(), $this->position->legalMoves());
    }

    /**
     * The board result, if the game is over.
     *
     * Threefold repetition and the fifty-move rule are applied automatically
     * rather than left as a claim, matching how casual online play works.
     */
    public function outcome(): ?Outcome
    {
        $white = $this->position->turn() === Position::WHITE;

        if ($this->position->legalMoves() === []) {
            if ($this->position->isCheck()) {
                return new Outcome($white ? '0-1' : '1-0', Outcome::CHECKMATE);
            }

            return new Outcome('1/2-1/2', Outcome::STALEMATE);
        }

        if ($this->position->hasInsufficientMaterial()) {
            return new Outcome('1/2-1/2', Outcome::INSUFFICIENT_MATERIAL);
        }

        if (max($this->repetitions) >= 3) {
            return new Outcome('1/2-1/2', Outcome::THREEFOLD_REPETITION);
        }

        if ($this->position->halfmoveClock() >= 100) {
            return new Outcome('1/2-1/2', Outcome::FIFTY_MOVES);
        }

        return null;
    }

    public function isCheck(): bool
    {
        return $this->position->isCheck();
    }

    public static function assertValidFen(string $fen): void
    {
        try {
            Position::fromFen($fen);
        } catch (InvalidArgumentException $e) {
            throw new InvalidArgumentException("Invalid FEN: {$e->getMessage()}", 0, $e);
        }
    }
}
