/** Global user directory facade: identity used by threaded comments and @mentions. */
import { _cacheUser, defaultCurrentUserId } from './threaded-comments.js';

type Handler = (...args: unknown[]) => void;

export interface IUser {
  id: string;
  name: string;
  email?: string;
  avatar?: unknown;
}

export interface IUserManagerOptions {
  get: (userId: string) => Promise<IUser | undefined>;
  search: (query: string) => Promise<IUser[] | undefined>;
}

const GUEST_NAME = 'Guest';

export class UserManager {
  private static handlers = new Map<string, Set<Handler>>();
  private static configured: Partial<IUserManagerOptions> = {};
  private static currentId?: string;
  private static known = new Map<string, IUser>();

  static bind(event: string, handler: Handler): void {
    let set = UserManager.handlers.get(event);
    if (!set) UserManager.handlers.set(event, (set = new Set()));
    set.add(handler);
  }
  static unbind(event: string, handler: Handler): void {
    UserManager.handlers.get(event)?.delete(handler);
  }
  static configure(options: IUserManagerOptions): void {
    UserManager.configured = { ...UserManager.configured, ...options };
  }
  static current(userId?: string): string | undefined {
    if (userId !== undefined) {
      UserManager.currentId = userId;
      UserManager.emit('currentChanged', { userId });
    }
    return UserManager.currentId ?? (UserManager.currentId = UserManager.guestId());
  }
  /** Guest id used when no identity has been configured. */
  static guestId(): string {
    return defaultCurrentUserId();
  }
  /** Register users locally so mentions and avatars resolve without a backend. */
  static register(users: IUser[]): void {
    for (const user of users) {
      UserManager.known.set(user.id, user);
      _cacheUser(user);
    }
  }
  static get(userId: string): Promise<IUser | undefined> {
    const guestId = UserManager.guestId();
    if (UserManager.configured.get) {
      return UserManager.configured.get(userId).then((user) => {
        if (user) {
          UserManager.known.set(user.id, user);
          _cacheUser(user);
        }
        return user;
      });
    }
    const known = UserManager.known.get(userId);
    if (known) return Promise.resolve(known);
    if (userId === UserManager.currentId || userId === guestId || !UserManager.currentId) {
      const guest: IUser = { id: userId || guestId, name: GUEST_NAME };
      UserManager.known.set(guest.id, guest);
      _cacheUser(guest);
      return Promise.resolve(guest);
    }
    return Promise.resolve(undefined);
  }
  static search(query: string): Promise<IUser[] | undefined> {
    if (UserManager.configured.search) return UserManager.configured.search(query);
    const needle = String(query ?? '').toLowerCase();
    return Promise.resolve([...UserManager.known.values()].filter((user) => user.name.toLowerCase().includes(needle)));
  }
  /** Synchronous access to the locally known users (guest + registered/fetched). */
  static _knownUsers(): IUser[] {
    UserManager.get(UserManager.current() ?? UserManager.guestId());
    return [...UserManager.known.values()];
  }
  /** Synchronous display-name lookup used by comment rendering; unknown ids render as Guest like the official build. */
  static _knownNameSync(userId: string): string {
    const known = UserManager.known.get(userId);
    if (known) return known.name;
    return GUEST_NAME;
  }
  /** True when the id is the current/guest user or a registered/fetched user. */
  static _isKnown(userId: string): boolean {
    return UserManager.known.has(userId) || userId === UserManager.current() || userId === UserManager.guestId();
  }
  private static emit(event: string, args: unknown): void {
    for (const handler of UserManager.handlers.get(event) ?? []) handler({}, args);
  }
}
