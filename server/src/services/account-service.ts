import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import { BlockedUser, Game, LinkRequest, User, type UserDoc } from '../models/index.js';
import { hashPassword } from '../lib/password.js';
import { removeStoredImage } from '../lib/images.js';
import { disconnectUser, notifyUser } from '../realtime/publish.js';
import { abortGame, announce, notifyChallengeClosed } from './game-service.js';

/**
 * Take a player out of play: withdraw every open challenge they posted or were
 * sent, and abort any game they are in, with no rating change for anyone.
 *
 * Used when an account is banned or deleted, so opponents are never left
 * facing a board nobody will move on, and the lobby never offers a game with
 * someone who can no longer play.
 */
export async function withdrawFromPlay(userId: Types.ObjectId | string): Promise<number> {
  const games = await Game.find({
    $or: [
      { status: 'open', $or: [{ creatorUserId: userId }, { invitedUserId: userId }] },
      { status: 'active', $or: [{ whiteUserId: userId }, { blackUserId: userId }] },
    ],
  }).select('_id status');

  let touched = 0;
  for (const { _id, status } of games) {
    const closed = await abortGame(String(_id), status === 'open' ? 'cancelled' : 'aborted', {
      from: [status as 'open' | 'active'],
    });
    if (!closed) continue;
    touched += 1;
    const game = await announce(String(_id), { lobby: true });
    if (status === 'open') notifyChallengeClosed(game, String(userId));
  }
  return touched;
}

/**
 * Delete an account at its owner's request.
 *
 * The row is anonymised rather than removed: finished games are part of their
 * opponents' history and rating record, and must keep pointing at *someone*.
 * Everything personal goes — name, email, avatar, links, blocks — and the
 * credentials are replaced with a random hash nobody knows.
 */
export async function deleteAccount(user: UserDoc): Promise<void> {
  const id = String(user._id);

  await withdrawFromPlay(user._id);
  await removeStoredImage(user.avatarUrl);

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        // Short enough for the username rules, unique because the id is.
        username: `del_${id}`,
        email: `deleted+${id}@invalid.local`,
        passwordHash: await hashPassword(randomUUID()),
        displayName: null,
        avatarUrl: null,
        country: null,
        linkedPlayerId: null,
        otpCodeHash: null,
        resetCodeHash: null,
        notifEmail: false,
        notifDm: false,
        notifGameChat: false,
        deletedAt: new Date(),
      },
      $inc: { tokenVersion: 1 },
    },
  );

  await Promise.all([
    BlockedUser.deleteMany({ $or: [{ blockerId: user._id }, { blockedId: user._id }] }),
    LinkRequest.updateMany(
      { userId: user._id, status: 'pending' },
      { $set: { status: 'rejected', adminNote: 'Account deleted', reviewedAt: new Date() } },
    ),
  ]);

  notifyUser(id, 'account:deleted', {});
  disconnectUser(id);
}
