<?php

declare(strict_types=1);

namespace App\Services\Chess;

/** How a game ended on the board, independent of resignations or flag falls. */
final class Outcome
{
    public const CHECKMATE = 'checkmate';

    public const STALEMATE = 'stalemate';

    public const INSUFFICIENT_MATERIAL = 'insufficient_material';

    public const FIFTY_MOVES = 'fifty_moves';

    public const THREEFOLD_REPETITION = 'threefold_repetition';

    public function __construct(
        /** One of "1-0", "0-1", "1/2-1/2". */
        public readonly string $result,
        public readonly string $termination,
    ) {}

    public function isDraw(): bool
    {
        return $this->result === '1/2-1/2';
    }
}
