import { Redis } from "@upstash/redis";
import { Session } from "@shopify/shopify-api";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const PREFIX = "shopify_session_";

export const sessionStorage = {
  async storeSession(session: Session): Promise<boolean> {
    await redis.set(`${PREFIX}${session.id}`, JSON.stringify(session.toPropertyArray()));
    if (session.shop) {
      await redis.sadd(`${PREFIX}shop_${session.shop}`, session.id);
    }
    return true;
  },

  async loadSession(id: string): Promise<Session | undefined> {
    const data = await redis.get<[string, string | number | boolean][]>(`${PREFIX}${id}`);
    if (!data) return undefined;
    return Session.fromPropertyArray(data);
  },

  async deleteSession(id: string): Promise<boolean> {
    const session = await this.loadSession(id);
    if (session?.shop) {
      await redis.srem(`${PREFIX}shop_${session.shop}`, id);
    }
    await redis.del(`${PREFIX}${id}`);
    return true;
  },

  async deleteSessions(ids: string[]): Promise<boolean> {
    await Promise.all(ids.map((id) => this.deleteSession(id)));
    return true;
  },

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const ids = await redis.smembers(`${PREFIX}shop_${shop}`);
    if (!ids.length) return [];
    const sessions = await Promise.all(ids.map((id) => this.loadSession(id)));
    return sessions.filter((s): s is Session => s !== undefined);
  },
};
