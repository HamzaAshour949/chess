<?php

declare(strict_types=1);

namespace App\Services\Chess;

use InvalidArgumentException;

/**
 * A chess position with full FIDE move generation.
 *
 * The board is a 0x88 array: index = rank * 16 + file, with rank 0 being
 * white's back rank and file 0 being the a-file. A square is on the board
 * when ($sq & 0x88) === 0, which makes off-board detection a single AND and
 * removes every bounds check from the sliding-piece loops.
 *
 * Squares hold a FEN character ('P', 'n', ...) or null. Moves are made and
 * unmade in place against an undo stack, so legality filtering costs one
 * make/unmake pair per pseudo-legal move rather than a full board copy.
 */
final class Position
{
    public const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    public const WHITE = 'w';

    public const BLACK = 'b';

    private const CASTLE_WK = 1;

    private const CASTLE_WQ = 2;

    private const CASTLE_BK = 4;

    private const CASTLE_BQ = 8;

    /** Squares whose occupancy change can invalidate a castling right. */
    private const CASTLE_MASK = [
        0 => self::CASTLE_WQ,    // a1
        4 => self::CASTLE_WK | self::CASTLE_WQ, // e1
        7 => self::CASTLE_WK,    // h1
        112 => self::CASTLE_BQ,  // a8
        116 => self::CASTLE_BK | self::CASTLE_BQ, // e8
        119 => self::CASTLE_BK,  // h8
    ];

    private const KNIGHT_OFFSETS = [-33, -31, -18, -14, 14, 18, 31, 33];

    private const KING_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17];

    private const BISHOP_OFFSETS = [-17, -15, 15, 17];

    private const ROOK_OFFSETS = [-16, -1, 1, 16];

    private const QUEEN_OFFSETS = [-17, -16, -15, -1, 1, 15, 16, 17];

    /** @var array<int,string|null> */
    private array $board;

    private string $turn = self::WHITE;

    private int $castling = 0;

    private ?int $ep = null;

    private int $halfmove = 0;

    private int $fullmove = 1;

    /** @var array<string,int> */
    private array $kings = [self::WHITE => -1, self::BLACK => -1];

    /** @var list<array{move:Move,castling:int,ep:int|null,halfmove:int,fullmove:int,turn:string}> */
    private array $undo = [];

    private function __construct()
    {
        $this->board = array_fill(0, 128, null);
    }

    // ------------------------------------------------------------------ FEN

    public static function start(): self
    {
        return self::fromFen(self::START_FEN);
    }

    public static function fromFen(string $fen): self
    {
        $parts = preg_split('/\s+/', trim($fen)) ?: [];
        if (count($parts) < 4) {
            throw new InvalidArgumentException('FEN must have at least four fields.');
        }

        $p = new self;

        $rank = 7;
        $file = 0;
        foreach (str_split($parts[0]) as $ch) {
            if ($ch === '/') {
                if ($file !== 8) {
                    throw new InvalidArgumentException('FEN rank does not describe eight files.');
                }
                $rank--;
                $file = 0;

                continue;
            }
            if (ctype_digit($ch)) {
                $file += (int) $ch;

                continue;
            }
            if (! str_contains('pnbrqkPNBRQK', $ch) || $rank < 0 || $file > 7) {
                throw new InvalidArgumentException("Invalid FEN piece placement near '{$ch}'.");
            }
            $sq = $rank * 16 + $file;
            $p->board[$sq] = $ch;
            if ($ch === 'K') {
                $p->kings[self::WHITE] = $sq;
            } elseif ($ch === 'k') {
                $p->kings[self::BLACK] = $sq;
            }
            $file++;
        }
        if ($rank !== 0 || $file !== 8) {
            throw new InvalidArgumentException('FEN must describe exactly eight ranks.');
        }

        $p->turn = $parts[1] === 'b' ? self::BLACK : self::WHITE;

        if ($parts[2] !== '-') {
            foreach (str_split($parts[2]) as $ch) {
                $p->castling |= match ($ch) {
                    'K' => self::CASTLE_WK,
                    'Q' => self::CASTLE_WQ,
                    'k' => self::CASTLE_BK,
                    'q' => self::CASTLE_BQ,
                    default => 0,
                };
            }
        }

        $p->ep = $parts[3] === '-' ? null : self::algebraicToSquare($parts[3]);
        $p->halfmove = isset($parts[4]) ? max(0, (int) $parts[4]) : 0;
        $p->fullmove = isset($parts[5]) ? max(1, (int) $parts[5]) : 1;

        if ($p->kings[self::WHITE] < 0 || $p->kings[self::BLACK] < 0) {
            throw new InvalidArgumentException('FEN must contain both kings.');
        }

        // A position where the side that just moved is still in check is illegal.
        if ($p->isAttacked($p->kings[self::swap($p->turn)], $p->turn)) {
            throw new InvalidArgumentException('FEN describes a position with the wrong side in check.');
        }

        return $p;
    }

    public function fen(): string
    {
        $rows = [];
        for ($rank = 7; $rank >= 0; $rank--) {
            $row = '';
            $empty = 0;
            for ($file = 0; $file < 8; $file++) {
                $piece = $this->board[$rank * 16 + $file];
                if ($piece === null) {
                    $empty++;

                    continue;
                }
                if ($empty > 0) {
                    $row .= $empty;
                    $empty = 0;
                }
                $row .= $piece;
            }
            if ($empty > 0) {
                $row .= $empty;
            }
            $rows[] = $row;
        }

        $castling = '';
        if ($this->castling & self::CASTLE_WK) {
            $castling .= 'K';
        }
        if ($this->castling & self::CASTLE_WQ) {
            $castling .= 'Q';
        }
        if ($this->castling & self::CASTLE_BK) {
            $castling .= 'k';
        }
        if ($this->castling & self::CASTLE_BQ) {
            $castling .= 'q';
        }

        return implode('/', $rows)
            .' '.$this->turn
            .' '.($castling === '' ? '-' : $castling)
            .' '.($this->ep === null ? '-' : self::squareToAlgebraic($this->ep))
            .' '.$this->halfmove
            .' '.$this->fullmove;
    }

    // -------------------------------------------------------------- getters

    public function turn(): string
    {
        return $this->turn;
    }

    public function halfmoveClock(): int
    {
        return $this->halfmove;
    }

    public function fullmoveNumber(): int
    {
        return $this->fullmove;
    }

    /** Piece placement + turn + castling + a *relevant* en-passant square. */
    public function repetitionKey(): string
    {
        $fen = $this->fen();
        $parts = explode(' ', $fen);

        // FIDE counts positions as equal when the same moves are available, so
        // an en-passant square only matters while the capture is actually legal.
        if ($parts[3] !== '-' && ! $this->hasLegalEnPassant()) {
            $parts[3] = '-';
        }

        return $parts[0].' '.$parts[1].' '.$parts[2].' '.$parts[3];
    }

    // ------------------------------------------------------------- squares

    public static function algebraicToSquare(string $sq): int
    {
        if (strlen($sq) !== 2) {
            throw new InvalidArgumentException("Invalid square '{$sq}'.");
        }
        $file = ord($sq[0]) - 97;
        $rank = ord($sq[1]) - 49;
        if ($file < 0 || $file > 7 || $rank < 0 || $rank > 7) {
            throw new InvalidArgumentException("Invalid square '{$sq}'.");
        }

        return $rank * 16 + $file;
    }

    public static function squareToAlgebraic(int $sq): string
    {
        return chr(97 + ($sq & 15)).chr(49 + ($sq >> 4));
    }

    public static function swap(string $color): string
    {
        return $color === self::WHITE ? self::BLACK : self::WHITE;
    }

    private static function colorOf(string $piece): string
    {
        return $piece === strtoupper($piece) ? self::WHITE : self::BLACK;
    }

    // ------------------------------------------------------------- attacks

    /** Is $square attacked by any piece of $byColor? */
    public function isAttacked(int $square, string $byColor): bool
    {
        $white = $byColor === self::WHITE;

        // Pawns: look back along the directions a pawn of $byColor captures in.
        $pawn = $white ? 'P' : 'p';
        foreach ($white ? [-17, -15] : [17, 15] as $offset) {
            $from = $square + $offset;
            if (($from & 0x88) === 0 && $this->board[$from] === $pawn) {
                return true;
            }
        }

        $knight = $white ? 'N' : 'n';
        foreach (self::KNIGHT_OFFSETS as $offset) {
            $from = $square + $offset;
            if (($from & 0x88) === 0 && $this->board[$from] === $knight) {
                return true;
            }
        }

        $king = $white ? 'K' : 'k';
        foreach (self::KING_OFFSETS as $offset) {
            $from = $square + $offset;
            if (($from & 0x88) === 0 && $this->board[$from] === $king) {
                return true;
            }
        }

        $bishop = $white ? 'B' : 'b';
        $rook = $white ? 'R' : 'r';
        $queen = $white ? 'Q' : 'q';

        foreach (self::BISHOP_OFFSETS as $offset) {
            $from = $square + $offset;
            while (($from & 0x88) === 0) {
                $piece = $this->board[$from];
                if ($piece !== null) {
                    if ($piece === $bishop || $piece === $queen) {
                        return true;
                    }
                    break;
                }
                $from += $offset;
            }
        }

        foreach (self::ROOK_OFFSETS as $offset) {
            $from = $square + $offset;
            while (($from & 0x88) === 0) {
                $piece = $this->board[$from];
                if ($piece !== null) {
                    if ($piece === $rook || $piece === $queen) {
                        return true;
                    }
                    break;
                }
                $from += $offset;
            }
        }

        return false;
    }

    public function isCheck(): bool
    {
        return $this->isAttacked($this->kings[$this->turn], self::swap($this->turn));
    }

    // ---------------------------------------------------------- generation

    /** @return list<Move> */
    public function legalMoves(): array
    {
        $legal = [];
        $us = $this->turn;
        $them = self::swap($us);

        foreach ($this->pseudoLegalMoves() as $move) {
            $this->makeMove($move);
            // A move is legal only if it does not leave our own king attacked.
            if (! $this->isAttacked($this->kings[$us], $them)) {
                $legal[] = $move;
            }
            $this->undoMove();
        }

        return $legal;
    }

    /** @return list<Move> */
    private function pseudoLegalMoves(): array
    {
        $moves = [];
        $us = $this->turn;
        $white = $us === self::WHITE;

        for ($sq = 0; $sq < 128; $sq++) {
            if ($sq & 0x88) {
                $sq += 7;

                continue;
            }
            $piece = $this->board[$sq];
            if ($piece === null || self::colorOf($piece) !== $us) {
                continue;
            }

            $type = strtolower($piece);

            if ($type === 'p') {
                $this->generatePawnMoves($moves, $sq, $piece, $white);

                continue;
            }

            $offsets = match ($type) {
                'n' => self::KNIGHT_OFFSETS,
                'b' => self::BISHOP_OFFSETS,
                'r' => self::ROOK_OFFSETS,
                'q' => self::QUEEN_OFFSETS,
                default => self::KING_OFFSETS,
            };
            $sliding = $type === 'b' || $type === 'r' || $type === 'q';

            foreach ($offsets as $offset) {
                $to = $sq + $offset;
                while (($to & 0x88) === 0) {
                    $target = $this->board[$to];
                    if ($target === null) {
                        $moves[] = new Move($sq, $to, $piece, null, null, Move::NORMAL);
                    } else {
                        if (self::colorOf($target) !== $us) {
                            $moves[] = new Move($sq, $to, $piece, $target, null, Move::CAPTURE);
                        }
                        break;
                    }
                    if (! $sliding) {
                        break;
                    }
                    $to += $offset;
                }
            }

            if ($type === 'k') {
                $this->generateCastles($moves, $sq, $piece, $white);
            }
        }

        return $moves;
    }

    /** @param  list<Move>  $moves */
    private function generatePawnMoves(array &$moves, int $sq, string $piece, bool $white): void
    {
        $forward = $white ? 16 : -16;
        $startRank = $white ? 1 : 6;
        $promoRank = $white ? 7 : 0;

        $one = $sq + $forward;
        if (($one & 0x88) === 0 && $this->board[$one] === null) {
            $this->pushPawnMove($moves, $sq, $one, $piece, null, Move::NORMAL, $promoRank);

            if (($sq >> 4) === $startRank) {
                $two = $sq + 2 * $forward;
                if ($this->board[$two] === null) {
                    $moves[] = new Move($sq, $two, $piece, null, null, Move::BIG_PAWN);
                }
            }
        }

        foreach ($white ? [15, 17] : [-15, -17] as $offset) {
            $to = $sq + $offset;
            if ($to & 0x88) {
                continue;
            }
            $target = $this->board[$to];
            if ($target !== null) {
                if (self::colorOf($target) !== self::colorOf($piece)) {
                    $this->pushPawnMove($moves, $sq, $to, $piece, $target, Move::CAPTURE, $promoRank);
                }
            } elseif ($this->ep !== null && $to === $this->ep) {
                $capturedPawn = $white ? 'p' : 'P';
                $moves[] = new Move($sq, $to, $piece, $capturedPawn, null, Move::EP_CAPTURE);
            }
        }
    }

    /** @param  list<Move>  $moves */
    private function pushPawnMove(array &$moves, int $from, int $to, string $piece, ?string $captured, int $flags, int $promoRank): void
    {
        if (($to >> 4) === $promoRank) {
            foreach (['q', 'r', 'b', 'n'] as $promotion) {
                $moves[] = new Move($from, $to, $piece, $captured, $promotion, $flags | Move::PROMOTION);
            }

            return;
        }
        $moves[] = new Move($from, $to, $piece, $captured, null, $flags);
    }

    /** @param  list<Move>  $moves */
    private function generateCastles(array &$moves, int $sq, string $piece, bool $white): void
    {
        $them = $white ? self::BLACK : self::WHITE;
        $home = $white ? 4 : 116;
        if ($sq !== $home) {
            return;
        }
        // The king may not castle out of, through, or into check.
        if ($this->isAttacked($home, $them)) {
            return;
        }

        $kingSide = $white ? self::CASTLE_WK : self::CASTLE_BK;
        $queenSide = $white ? self::CASTLE_WQ : self::CASTLE_BQ;
        $rook = $white ? 'R' : 'r';

        if (($this->castling & $kingSide)
            && $this->board[$home + 3] === $rook
            && $this->board[$home + 1] === null
            && $this->board[$home + 2] === null
            && ! $this->isAttacked($home + 1, $them)
            && ! $this->isAttacked($home + 2, $them)
        ) {
            $moves[] = new Move($sq, $home + 2, $piece, null, null, Move::KSIDE_CASTLE);
        }

        if (($this->castling & $queenSide)
            && $this->board[$home - 4] === $rook
            && $this->board[$home - 1] === null
            && $this->board[$home - 2] === null
            && $this->board[$home - 3] === null
            && ! $this->isAttacked($home - 1, $them)
            && ! $this->isAttacked($home - 2, $them)
        ) {
            $moves[] = new Move($sq, $home - 2, $piece, null, null, Move::QSIDE_CASTLE);
        }
    }

    // -------------------------------------------------------- make / unmake

    public function makeMove(Move $move): void
    {
        $this->undo[] = [
            'move' => $move,
            'castling' => $this->castling,
            'ep' => $this->ep,
            'halfmove' => $this->halfmove,
            'fullmove' => $this->fullmove,
            'turn' => $this->turn,
        ];

        $us = $this->turn;
        $white = $us === self::WHITE;

        $this->board[$move->to] = $move->promotion !== null
            ? ($white ? strtoupper($move->promotion) : $move->promotion)
            : $move->piece;
        $this->board[$move->from] = null;

        if ($move->flags & Move::EP_CAPTURE) {
            $this->board[$move->to + ($white ? -16 : 16)] = null;
        }

        if ($move->flags & Move::KSIDE_CASTLE) {
            $this->board[$move->to - 1] = $this->board[$move->to + 1];
            $this->board[$move->to + 1] = null;
        } elseif ($move->flags & Move::QSIDE_CASTLE) {
            $this->board[$move->to + 1] = $this->board[$move->to - 2];
            $this->board[$move->to - 2] = null;
        }

        if (strtolower($move->piece) === 'k') {
            $this->kings[$us] = $move->to;
        }

        $this->castling &= ~(self::CASTLE_MASK[$move->from] ?? 0);
        $this->castling &= ~(self::CASTLE_MASK[$move->to] ?? 0);

        $this->ep = ($move->flags & Move::BIG_PAWN)
            ? $move->from + ($white ? 16 : -16)
            : null;

        if (strtolower($move->piece) === 'p' || $move->isCapture()) {
            $this->halfmove = 0;
        } else {
            $this->halfmove++;
        }

        if (! $white) {
            $this->fullmove++;
        }

        $this->turn = self::swap($us);
    }

    public function undoMove(): void
    {
        $state = array_pop($this->undo);
        if ($state === null) {
            return;
        }

        /** @var Move $move */
        $move = $state['move'];
        $this->castling = $state['castling'];
        $this->ep = $state['ep'];
        $this->halfmove = $state['halfmove'];
        $this->fullmove = $state['fullmove'];
        $this->turn = $state['turn'];

        $white = $this->turn === self::WHITE;

        $this->board[$move->from] = $move->piece;
        $this->board[$move->to] = null;

        if ($move->flags & Move::EP_CAPTURE) {
            $this->board[$move->to + ($white ? -16 : 16)] = $move->captured;
        } elseif ($move->captured !== null) {
            $this->board[$move->to] = $move->captured;
        }

        if ($move->flags & Move::KSIDE_CASTLE) {
            $this->board[$move->to + 1] = $this->board[$move->to - 1];
            $this->board[$move->to - 1] = null;
        } elseif ($move->flags & Move::QSIDE_CASTLE) {
            $this->board[$move->to - 2] = $this->board[$move->to + 1];
            $this->board[$move->to + 1] = null;
        }

        if (strtolower($move->piece) === 'k') {
            $this->kings[$this->turn] = $move->from;
        }
    }

    // --------------------------------------------------------------- lookup

    /** Resolve a UCI string ("e2e4", "e7e8q") against the legal move list. */
    public function moveFromUci(string $uci): ?Move
    {
        $uci = strtolower(trim($uci));
        if (! preg_match('/^[a-h][1-8][a-h][1-8][qrbn]?$/', $uci)) {
            return null;
        }
        $from = self::algebraicToSquare(substr($uci, 0, 2));
        $to = self::algebraicToSquare(substr($uci, 2, 2));
        $promotion = strlen($uci) === 5 ? $uci[4] : null;

        foreach ($this->legalMoves() as $move) {
            if ($move->from === $from && $move->to === $to && $move->promotion === $promotion) {
                return $move;
            }
        }

        // Tolerate a client that omits the promotion piece; default to a queen.
        if ($promotion === null) {
            foreach ($this->legalMoves() as $move) {
                if ($move->from === $from && $move->to === $to && $move->promotion === 'q') {
                    return $move;
                }
            }
        }

        return null;
    }

    /**
     * Standard Algebraic Notation for a legal move in this position.
     *
     * Must be called before the move is made.
     */
    public function san(Move $move): string
    {
        if ($move->flags & Move::KSIDE_CASTLE) {
            $san = 'O-O';
        } elseif ($move->flags & Move::QSIDE_CASTLE) {
            $san = 'O-O-O';
        } else {
            $type = strtolower($move->piece);
            $target = self::squareToAlgebraic($move->to);

            if ($type === 'p') {
                $san = $move->isCapture()
                    ? self::squareToAlgebraic($move->from)[0].'x'.$target
                    : $target;
                if ($move->promotion !== null) {
                    $san .= '='.strtoupper($move->promotion);
                }
            } else {
                $san = strtoupper($type)
                    .$this->disambiguate($move)
                    .($move->isCapture() ? 'x' : '')
                    .$target;
            }
        }

        $this->makeMove($move);
        if ($this->isCheck()) {
            $san .= $this->legalMoves() === [] ? '#' : '+';
        }
        $this->undoMove();

        return $san;
    }

    private function disambiguate(Move $move): string
    {
        $sameFile = false;
        $sameRank = false;
        $ambiguous = false;

        foreach ($this->legalMoves() as $other) {
            if ($other->from === $move->from || $other->to !== $move->to || $other->piece !== $move->piece) {
                continue;
            }
            $ambiguous = true;
            if (($other->from & 15) === ($move->from & 15)) {
                $sameFile = true;
            }
            if (($other->from >> 4) === ($move->from >> 4)) {
                $sameRank = true;
            }
        }

        if (! $ambiguous) {
            return '';
        }

        $from = self::squareToAlgebraic($move->from);

        return match (true) {
            $sameFile && $sameRank => $from,
            $sameFile => $from[1],
            default => $from[0],
        };
    }

    private function hasLegalEnPassant(): bool
    {
        if ($this->ep === null) {
            return false;
        }
        foreach ($this->legalMoves() as $move) {
            if ($move->flags & Move::EP_CAPTURE) {
                return true;
            }
        }

        return false;
    }

    // -------------------------------------------------------------- outcome

    public function hasInsufficientMaterial(): bool
    {
        $counts = ['P' => 0, 'N' => 0, 'B' => 0, 'R' => 0, 'Q' => 0, 'p' => 0, 'n' => 0, 'b' => 0, 'r' => 0, 'q' => 0];
        $bishopSquares = [];

        for ($sq = 0; $sq < 128; $sq++) {
            if ($sq & 0x88) {
                $sq += 7;

                continue;
            }
            $piece = $this->board[$sq];
            if ($piece === null || strtolower($piece) === 'k') {
                continue;
            }
            $counts[$piece]++;
            if (strtolower($piece) === 'b') {
                // Light squares have an odd file+rank sum.
                $bishopSquares[$piece][] = (($sq & 15) + ($sq >> 4)) % 2;
            }
        }

        if ($counts['P'] || $counts['p'] || $counts['R'] || $counts['r'] || $counts['Q'] || $counts['q']) {
            return false;
        }

        $white = $counts['N'] + $counts['B'];
        $black = $counts['n'] + $counts['b'];

        // K vs K, and K+minor vs K, can never be mated.
        if ($white + $black <= 1) {
            return true;
        }

        // Two lone bishops on the same colour complex can never mate either.
        if ($counts['B'] === 1 && $counts['b'] === 1 && $counts['N'] === 0 && $counts['n'] === 0) {
            return ($bishopSquares['B'][0] ?? 0) === ($bishopSquares['b'][0] ?? 1);
        }

        return false;
    }

    // ----------------------------------------------------------------- perft

    /** Node count at $depth — used by the test suite to verify move generation. */
    public function perft(int $depth): int
    {
        if ($depth <= 0) {
            return 1;
        }

        $moves = $this->legalMoves();
        if ($depth === 1) {
            return count($moves);
        }

        $nodes = 0;
        foreach ($moves as $move) {
            $this->makeMove($move);
            $nodes += $this->perft($depth - 1);
            $this->undoMove();
        }

        return $nodes;
    }
}
