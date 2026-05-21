import { Redis } from "@upstash/redis";
import { Session } from "@shopify/shopify-api";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const KEY = (id: string) => `shopify_session_${id}`;
const SHOP_KEY = (shop: string) => `shopify_shop_${shop}`;

export const sessionStorage = {
  async storeSession(session: Session): Promise<boolean> {
    const payload = {
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope ?? "",
      accessToken: session.accessToken ?? "",
      expires: session.expires ? session.expires.toISOString() : null,
    };
    await redis.set(KEY(session.id), JSON.stringify(payload));
    await redis.sadd(SHOP_KEY(session.shop), session.id);
    return true;
  },

  async loadSession(id: string): Promise<Session | undefined> {
    const raw = await redis.get<string>(KEY(id));
    if (!raw) return undefined;
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const session = new Session({
      id: data.id,
      shop: data.shop,
      state: data.state,
      isOnline: data.isOnline ?? false,
    });
    session.scope = data.scope;
    session.accessToken = data.accessToken;
    if (data.expires) session.expires = new Date(data.expires);
    return session;
  },

  async deleteSession(id: string): Promise<boolean> {
    const session = await this.loadSession(id);
    if (session) await redis.srem(SHOP_KEY(session.shop), id);
    await redis.del(KEY(id));
    return true;
  },

  async deleteSessions(ids: string[]): Promise<boolean> {
    await Promise.all(ids.map((id) => this.deleteSession(id)));
    return true;
  },

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const ids = await redis.smembers(SHOP_KEY(shop));
    if (!ids.length) return [];
    const sessions = await Promise.all(ids.map((id) => this.loadSession(id)));
    return sessions.filter((s): s is Session => s !== undefined);
  },
};
