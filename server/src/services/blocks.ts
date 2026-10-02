import type { Types } from 'mongoose';
import { BlockedUser } from '../models/index.js';

type Id = Types.ObjectId | string;

/** Is either side blocking the other? A block works in both directions. */
export async function blockedBetween(a: Id, b: Id): Promise<boolean> {
  const found = await BlockedUser.exists({
    $or: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  });
  return Boolean(found);
}

/** Has `blocker` blocked `blocked`? One direction only. */
export async function hasBlocked(blocker: Id, blocked: Id): Promise<boolean> {
  return Boolean(await BlockedUser.exists({ blockerId: blocker, blockedId: blocked }));
}
