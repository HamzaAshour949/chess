import type { AdminDoc, UserDoc } from '../models/index.js';

declare global {
  namespace Express {
    interface Request {
      /** Decoded token claims, present once `authenticate` has run. */
      auth?: { id: string; role: 'admin' | 'user' };
      /** Loaded and validated actor. Exactly one of these is ever set. */
      currentUser?: UserDoc;
      currentAdmin?: AdminDoc;
    }
  }
}

export {};
