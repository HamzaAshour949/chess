<?php

declare(strict_types=1);

namespace Tests\Unit\Chess;

use App\Services\Chess\Move;
use App\Services\Chess\Position;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PositionTest extends TestCase
{
    /**
     * Perft (node counts at a fixed depth) is the standard correctness proof
     * for a move generator: a single missing or spurious move anywhere in the
     * tree changes the total. These six positions between them exercise
     * castling, en passant, promotion, pins, discovered check and stalemate.
     *
     * Reference values: https://www.chessprogramming.org/Perft_Results
     *
     * @return array<string,array{string,int,int}>
     */
    public static function perftPositions(): array
    {
        $cases = [
            'initial' => [Position::START_FEN, [20, 400, 8902, 197281]],
            'kiwipete' => ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
            'endgame' => ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
            'promotions' => ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
            'talkchess' => ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
            'steven' => ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
        ];

        $out = [];
        foreach ($cases as $name => [$fen, $counts]) {
            foreach ($counts as $i => $expected) {
                $out[$name.' depth '.($i + 1)] = [$fen, $i + 1, $expected];
            }
        }

        return $out;
    }

    #[DataProvider('perftPositions')]
    public function test_perft_matches_reference_node_counts(string $fen, int $depth, int $expected): void
    {
        $position = Position::fromFen($fen);

        $this->assertSame($expected, $position->perft($depth));

        // perft makes and unmakes every move; the position must be untouched.
        $this->assertSame($fen, $position->fen(), 'make/unmake left the board dirty');
    }

    public function test_fen_round_trips(): void
    {
        $fen = 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';

        $this->assertSame($fen, Position::fromFen($fen)->fen());
    }

    public function test_rejects_a_fen_without_kings(): void
    {
        $this->expectException(InvalidArgumentException::class);

        Position::fromFen('8/8/8/8/8/8/8/8 w - - 0 1');
    }

    public function test_rejects_a_position_with_the_wrong_side_in_check(): void
    {
        $this->expectException(InvalidArgumentException::class);

        // Black's king is attacked along the e-file but it is white to move,
        // so black must have left its own king en prise: not a reachable position.
        Position::fromFen('4k3/8/8/8/8/8/8/K3R3 w - - 0 1');
    }

    public function test_square_conversion_is_symmetric(): void
    {
        foreach (['a1', 'e4', 'h8', 'd7'] as $square) {
            $this->assertSame($square, Position::squareToAlgebraic(Position::algebraicToSquare($square)));
        }
    }

    public function test_en_passant_capture_removes_the_passed_pawn(): void
    {
        $position = Position::fromFen('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');

        $move = $position->moveFromUci('e5f6');
        $this->assertNotNull($move);
        $this->assertSame(Move::EP_CAPTURE, $move->flags & Move::EP_CAPTURE);

        $position->makeMove($move);
        $this->assertStringStartsWith('rnbqkbnr/ppp1p1pp/5P2/3p4/', $position->fen());
    }

    public function test_castling_moves_the_rook(): void
    {
        $position = Position::fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');

        $position->makeMove($position->moveFromUci('e1g1'));
        $this->assertStringStartsWith('r3k2r/8/8/8/8/8/8/R4RK1 b kq -', $position->fen());
    }

    public function test_castling_through_check_is_illegal(): void
    {
        // A black rook on f8 covers f1, so white may not castle king-side.
        $position = Position::fromFen('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1');

        $this->assertNull($position->moveFromUci('e1g1'));
        $this->assertNotNull($position->moveFromUci('e1c1'));
    }

    public function test_a_pinned_piece_cannot_move_away(): void
    {
        // The knight on e2 is pinned against the king on e1 by the rook on e8.
        $position = Position::fromFen('4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1');

        $this->assertNull($position->moveFromUci('e2c3'));
    }

    public function test_uci_without_a_promotion_piece_defaults_to_a_queen(): void
    {
        $position = Position::fromFen('8/4P3/8/8/8/8/8/K6k w - - 0 1');

        $move = $position->moveFromUci('e7e8');
        $this->assertNotNull($move);
        $this->assertSame('q', $move->promotion);
    }

    public function test_insufficient_material(): void
    {
        $insufficient = [
            '8/8/8/4k3/8/8/8/4K3 w - - 0 1',            // K v K
            '8/8/8/4k3/8/8/8/3BK3 w - - 0 1',           // K+B v K
            '8/8/8/4k3/8/8/8/3NK3 w - - 0 1',           // K+N v K
            '8/8/2b5/4k3/8/8/8/3BK3 w - - 0 1',         // same-colour bishops
        ];
        foreach ($insufficient as $fen) {
            $this->assertTrue(Position::fromFen($fen)->hasInsufficientMaterial(), $fen);
        }

        $sufficient = [
            '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',           // queen
            '8/8/8/4k3/8/8/4P3/4K3 w - - 0 1',          // pawn
            '8/8/8/4k3/8/8/8/2BBK3 w - - 0 1',          // bishop pair
            '8/8/3b4/4k3/8/8/8/3BK3 w - - 0 1',         // opposite-colour bishops
        ];
        foreach ($sufficient as $fen) {
            $this->assertFalse(Position::fromFen($fen)->hasInsufficientMaterial(), $fen);
        }
    }

    public function test_san_disambiguates_and_marks_check(): void
    {
        // Two knights on b1 and f3 can both reach d2.
        $position = Position::fromFen('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1');
        $this->assertSame('Nbd2', $position->san($position->moveFromUci('b1d2')));
        $this->assertSame('Nfd2', $position->san($position->moveFromUci('f3d2')));

        $mate = Position::fromFen('6k1/5ppp/8/8/8/8/8/R3K3 w Q - 0 1');
        $this->assertSame('Ra8#', $mate->san($mate->moveFromUci('a1a8')));

        $check = Position::fromFen('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1');
        $this->assertSame('Ra8+', $check->san($check->moveFromUci('a1a8')));

        $castle = Position::fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
        $this->assertSame('O-O-O', $castle->san($castle->moveFromUci('e1c1')));
    }
}
