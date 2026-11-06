/** Minimal global user manager facade matching the public contract. */
type Handler = (...args: unknown[]) => void;

export class UserManager {
  private static handlers = new Map<string, Set<Handler>>();
  private static configured: Record<string, unknown> = {};
  private static currentId?: string;

  static bind(event: string, handler: Handler): void {
    let set = UserManager.handlers.get(event);
    if (!set) UserManager.handlers.set(event, (set = new Set()));
    set.add(handler);
  }
  static unbind(event: string, handler: Handler): void {
    UserManager.handlers.get(event)?.delete(handler);
  }
  static configure(options: Record<string, unknown>): void {
    UserManager.configured = { ...UserManager.configured, ...options };
  }
  static current(userId?: string): string | undefined {
    if (userId !== undefined) UserManager.currentId = userId;
    return UserManager.currentId;
  }
  static get(_userId: string): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}
