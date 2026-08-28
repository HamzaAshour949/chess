<?php

declare(strict_types=1);

namespace App\Services\Chess;

/**
 * A single fully-resolved chess move.
 *
 * Squares are 0x88 indices (see {@see Position}). `piece` and `captured` keep
 * their FEN casing (uppercase = white), while `promotion` is always lowercase
 * because that is what UCI expects on the wire.
 */
final class Move
{
    public const NORMAL = 1;

    public const CAPTURE = 2;

    public const BIG_PAWN = 4;

    public const EP_CAPTURE = 8;

    public const PROMOTION = 16;

    public const KSIDE_CASTLE = 32;

    public const QSIDE_CASTLE = 64;

    public function __construct(
        public readonly int $from,
        public readonly int $to,
        public readonly string $piece,
        public readonly ?string $captured = null,
        public readonly ?string $promotion = null,
        public readonly int $flags = self::NORMAL,
    ) {}

    public function isCapture(): bool
    {
        return ($this->flags & (self::CAPTURE | self::EP_CAPTURE)) !== 0;
    }

    public function isCastle(): bool
    {
        return ($this->flags & (self::KSIDE_CASTLE | self::QSIDE_CASTLE)) !== 0;
    }

    public function uci(): string
    {
        return Position::squareToAlgebraic($this->from)
            .Position::squareToAlgebraic($this->to)
            .($this->promotion ?? '');
    }
}
