<?php

declare(strict_types=1);

namespace Tests\Unit\Chess;

use App\Services\Chess\IllegalMoveException;
use App\Services\Chess\MatchState;
use App\Services\Chess\Outcome;
use PHPUnit\Framework\TestCase;

final class MatchStateTest extends TestCase
{
    public function test_replaying_a_move_list_reproduces_the_position(): void
    {
        $state = MatchState::replay('e2e4 e7e5 g1f3 b8c6 f1b5');

        $this->assertSame(5, $state->moveCount());
        $this->assertSame('black', $state->turn());
        $this->assertSame(
            'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
            $state->fen()
        );
        $this->assertSame('1. e4 e5 2. Nf3 Nc6 3. Bb5', $state->pgn());
    }

    public function test_an_illegal_move_is_rejected(): void
    {
        $state = MatchState::fresh();

        $this->expectException(IllegalMoveException::class);
        $state->play('e2e5');
    }

    public function test_garbage_input_is_rejected(): void
    {
        $state = MatchState::fresh();

        $this->expectException(IllegalMoveException::class);
        $state->play('<script>alert(1)</script>');
    }

    public function test_fools_mate_is_detected(): void
    {
        $state = MatchState::replay('f2f3 e7e5 g2g4 d8h4');

        $outcome = $state->outcome();
        $this->assertNotNull($outcome);
        $this->assertSame('0-1', $outcome->result);
        $this->assertSame(Outcome::CHECKMATE, $outcome->termination);
        $this->assertSame('1. f3 e5 2. g4 Qh4#', $state->pgn());
    }

    public function test_no_move_is_accepted_once_the_game_is_over(): void
    {
        $state = MatchState::replay('f2f3 e7e5 g2g4 d8h4');

        $this->expectException(IllegalMoveException::class);
        $state->play('e1f2');
    }

    public function test_stalemate_is_a_draw(): void
    {
        $state = MatchState::replay('c2c4 h7h5 h2h4 a7a5 d1a4 a8a6 a4a5 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6');

        $outcome = $state->outcome();
        $this->assertNotNull($outcome);
        $this->assertSame('1/2-1/2', $outcome->result);
        $this->assertSame(Outcome::STALEMATE, $outcome->termination);
    }

    public function test_threefold_repetition_is_a_draw(): void
    {
        // Both knights shuffle back and forth, restoring the start position twice.
        $state = MatchState::replay('g1f3 g8f6 f3g1 f6g8 g1f3 g8f6 f3g1 f6g8');

        $outcome = $state->outcome();
        $this->assertNotNull($outcome);
        $this->assertSame(Outcome::THREEFOLD_REPETITION, $outcome->termination);
    }

    public function test_two_repetitions_are_not_yet_a_draw(): void
    {
        $state = MatchState::replay('g1f3 g8f6 f3g1 f6g8');

        $this->assertNull($state->outcome());
    }

    public function test_insufficient_material_ends_the_game(): void
    {
        $state = MatchState::replay(null, '8/8/4k3/8/8/8/4K3/7B w - - 0 1');

        $outcome = $state->outcome();
        $this->assertNotNull($outcome);
        $this->assertSame(Outcome::INSUFFICIENT_MATERIAL, $outcome->termination);
    }

    public function test_the_fifty_move_rule_ends_the_game(): void
    {
        $state = MatchState::replay(null, '7k/8/8/3B4/8/8/8/6KN w - - 99 80');
        $state->play('g1g2');

        $outcome = $state->outcome();
        $this->assertNotNull($outcome);
        $this->assertSame(Outcome::FIFTY_MOVES, $outcome->termination);
    }

    public function test_promotion_is_recorded_in_uci_and_san(): void
    {
        $state = MatchState::replay(null, '8/4P3/8/8/8/8/8/K6k w - - 0 1');
        $state->play('e7e8n');

        $this->assertSame('e7e8n', $state->uciMoves());
        $this->assertSame(['e8=N'], $state->sanMoves());
    }

    public function test_move_list_splitting_tolerates_padding(): void
    {
        $this->assertSame([], MatchState::splitMoves(null));
        $this->assertSame([], MatchState::splitMoves('   '));
        $this->assertSame(['e2e4', 'e7e5'], MatchState::splitMoves("  e2e4   e7e5\n"));
    }
}
