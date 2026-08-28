import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { BlockedUser, DirectMessage, User, conversationKey } from '../models/index.js';
import { asyncHandler } from '../lib/async-handler.js';
import { HttpError } from '../lib/http-error.js';
import { objectId, parseBody, parseQuery } from '../lib/validate.js';
import { serializeDirectMessage, serializeUser } from '../lib/serializers.js';
import { sanitizeChat } from '../lib/sanitize.js';
import { currentUser, requireUser } from '../middleware/auth.js';
import { dmLimiter } from '../middleware/rate-limit.js';
import { publishDirectMessage } from '../realtime/publish.js';

export const messagesRouter: Router = Router();

const DM_MAX = 2000;

/** Is either side blocking the other? */
async function blockedBetween(a: Types.ObjectId | string, b: Types.ObjectId | string) {
  return BlockedUser.exists({
    $or: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  });
}

// ------------------------------------------------------------------ threads

/**
 * One row per conversation, with the last message and an unread count.
 *
 * Grouped in the database. The Flask version pulled the last 500 messages into
 * memory and bucketed them there, which silently dropped older conversations
 * and under-counted unread messages once an account got busy.
 */
messagesRouter.get(
  '/threads',
  requireUser,
  asyncHandler(async (req, res) => {
    const me = currentUser(req)._id;

    const rows = await DirectMessage.aggregate<{
      _id: string;
      lastMessage: Record<string, unknown>;
      unread: number;
    }>([
      { $match: { $or: [{ senderId: me }, { recipientId: me }] } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$pairKey',
          lastMessage: { $first: '$$ROOT' },
          unread: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$recipientId', me] },
                    { $eq: ['$readAt', null] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { 'lastMessage.createdAt': -1 } },
      { $limit: 100 },
    ]);

    const otherIds = rows.map((row) =>
      String(row.lastMessage.senderId) === String(me)
        ? row.lastMessage.recipientId
        : row.lastMessage.senderId,
    );

    // One extra query for every participant, rather than one per thread.
    const others = await User.find({ _id: { $in: otherIds } }).populate(
      'linkedPlayerId',
      'nameEn title',
    );
    const byId = new Map(others.map((user) => [String(user._id), user]));

    res.json(
      rows.map((row, index) => {
        const other = byId.get(String(otherIds[index]));
        return {
          other_user: other ? serializeUser(other) : null,
          last_message: serializeDirectMessage(
            row.lastMessage as Parameters<typeof serializeDirectMessage>[0],
            String(me),
          ),
          unread: row.unread,
        };
      }),
    );
  }),
);

messagesRouter.get(
  '/unread-count',
  requireUser,
  asyncHandler(async (req, res) => {
    const unread = await DirectMessage.countDocuments({
      recipientId: currentUser(req)._id,
      readAt: null,
      isDeleted: false,
    });
    res.json({ unread });
  }),
);

// ----------------------------------------------------------- conversation

messagesRouter.get(
  '/with/:userId',
  requireUser,
  asyncHandler(async (req, res) => {
    const otherId = objectId.parse(req.params.userId);
    const me = currentUser(req);

    if (otherId === String(me._id)) throw HttpError.badRequest('You cannot message yourself');

    const other = await User.findById(otherId).populate('linkedPlayerId', 'nameEn title');
    if (!other) throw HttpError.notFound('Player not found');

    // A block hides the conversation in both directions, rather than only
    // stopping new messages while the history stayed readable.
    if (await blockedBetween(me._id, other._id)) {
      throw HttpError.forbidden('This conversation is unavailable');
    }

    const { limit } = parseQuery(
      z.object({ limit: z.coerce.number().int().min(1).max(200).default(100) }),
      req,
    );

    const pairKey = conversationKey(String(me._id), otherId);
    const messages = await DirectMessage.find({ pairKey })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('senderId', 'username displayName')
      .populate('recipientId', 'username displayName');

    messages.reverse();

    // Mark everything addressed to me as read, in one write.
    await DirectMessage.updateMany(
      { pairKey, recipientId: me._id, readAt: null },
      { $set: { readAt: new Date() } },
    );

    res.json({
      other_user: serializeUser(other),
      messages: messages.map((message) => serializeDirectMessage(message, String(me._id))),
    });
  }),
);

const sendSchema = z.object({
  content: z.string().min(1, 'Message is empty').max(4000),
});

messagesRouter.post(
  '/with/:userId',
  requireUser,
  dmLimiter,
  asyncHandler(async (req, res) => {
    const otherId = objectId.parse(req.params.userId);
    const { content } = parseBody(sendSchema, req);
    const me = currentUser(req);

    if (otherId === String(me._id)) throw HttpError.badRequest('You cannot message yourself');

    const other = await User.findById(otherId);
    if (!other) throw HttpError.notFound('Player not found');
    if (other.isBanned) throw HttpError.forbidden('This player is unavailable');
    if (me.chatMuted) throw HttpError.forbidden('You are muted');
    if (!other.notifDm) throw HttpError.forbidden('This player has direct messages turned off');
    if (await blockedBetween(me._id, other._id)) {
      throw HttpError.forbidden('You cannot message this player');
    }

    // Links are kept in direct messages: unlike in-game chat, a DM between two
    // people who chose to talk is a reasonable place to share one.
    const clean = sanitizeChat(content, DM_MAX, false);
    if (!clean) throw HttpError.badRequest('Message is empty');

    const message = await DirectMessage.create({
      senderId: me._id,
      recipientId: other._id,
      content: clean,
      pairKey: conversationKey(String(me._id), otherId),
    });
    await message.populate('senderId', 'username displayName');
    await message.populate('recipientId', 'username displayName');

    const payload = serializeDirectMessage(message, String(me._id));
    // Delivered live to the recipient's personal channel.
    publishDirectMessage(otherId, serializeDirectMessage(message, otherId));

    res.status(201).json(payload);
  }),
);

// ------------------------------------------------------------------ blocks

messagesRouter.get(
  '/blocks',
  requireUser,
  asyncHandler(async (req, res) => {
    const blocks = await BlockedUser.find({ blockerId: currentUser(req)._id }).select('blockedId');
    const users = await User.find({ _id: { $in: blocks.map((block) => block.blockedId) } });
    res.json(users.map(serializeUser));
  }),
);

messagesRouter.post(
  '/blocks/:userId',
  requireUser,
  asyncHandler(async (req, res) => {
    const otherId = objectId.parse(req.params.userId);
    const me = currentUser(req);

    if (otherId === String(me._id)) throw HttpError.badRequest('You cannot block yourself');
    if (!(await User.exists({ _id: otherId }))) throw HttpError.notFound('Player not found');

    // Upsert, so blocking twice is not an error.
    await BlockedUser.updateOne(
      { blockerId: me._id, blockedId: otherId },
      { $setOnInsert: { blockerId: me._id, blockedId: otherId } },
      { upsert: true },
    );

    res.status(201).json({ message: 'Blocked' });
  }),
);

messagesRouter.delete(
  '/blocks/:userId',
  requireUser,
  asyncHandler(async (req, res) => {
    const otherId = objectId.parse(req.params.userId);
    await BlockedUser.deleteOne({ blockerId: currentUser(req)._id, blockedId: otherId });
    res.json({ message: 'Unblocked' });
  }),
);
