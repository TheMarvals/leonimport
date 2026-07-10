import Redis from 'ioredis';
import { prisma } from './prisma';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

class RedisManager {
  private static instance: Redis | null = null;
  private static isRedisDown = false;

  // Cache en memoria para fallback cuando Redis no está disponible
  private static memoryCache = new Map<string, string>();

  // Estadísticas de cache hits/misses para monitoreo
  private static cacheStats = {
    l1Hits: 0,
    l2Hits: 0,
    misses: 0,
    sets: 0,
    setErrors: 0,
  };

  static getInstance(): Redis {
    if (!this.instance) {
      this.instance = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 200,
        retryStrategy() { return null; },
      });

      this.instance.on('error', () => {
        this.isRedisDown = true;
      });

      this.instance.on('connect', () => {
        this.isRedisDown = false;
      });
    }
    return this.instance;
  }

  /**
   * Ejecuta un comando Redis con fall-through automático a Postgres.
   * Si Redis falla, usa la tabla EmergencyLock.
   */
  private static async withFallthrough<T>(
    redisAction: (redis: Redis) => Promise<T>,
    fallbackAction: () => Promise<T>,
  ): Promise<T> {
    if (this.isRedisDown) {
      return fallbackAction();
    }
    try {
      const redis = this.getInstance();
      return await redisAction(redis);
    } catch {
      console.warn('Redis unavailable, falling through to Postgres');
      this.isRedisDown = true;
      return fallbackAction();
    }
  }

  /**
   * Intenta bloquear una orden. Fall-through a Postgres si Redis está caído.
   */
  static async lockOrder(mlId: string, userId: string, ttlSeconds: number = 900): Promise<boolean> {
    const key = `order_lock:${mlId}`;

    return this.withFallthrough(
      async (redis) => {
        const result = await redis.set(key, userId, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      },
      async () => {
        // Limpiar locks expirados primero
        await prisma.emergencyLock.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        try {
          await prisma.emergencyLock.create({
            data: { key, userId, expiresAt: new Date(Date.now() + ttlSeconds * 1000) },
          });
          return true;
        } catch {
          return false; // Lock ya existe
        }
      },
    );
  }

  /**
   * Refresca el bloqueo (Heartbeat). Fall-through a Postgres.
   */
  static async refreshLock(mlId: string, userId: string, ttlSeconds: number = 900): Promise<boolean> {
    const key = `order_lock:${mlId}`;

    return this.withFallthrough(
      async (redis) => {
        const currentUser = await redis.get(key);
        if (currentUser === userId) {
          await redis.expire(key, ttlSeconds);
          return true;
        }
        return false;
      },
      async () => {
        const result = await prisma.emergencyLock.updateMany({
          where: { key, userId },
          data: { expiresAt: new Date(Date.now() + ttlSeconds * 1000) },
        });
        return result.count > 0;
      },
    );
  }

  /**
   * Verifica quién tiene el lock de una orden. Fall-through a Postgres.
   */
  static async getLockOwner(mlId: string): Promise<string | null> {
    const key = `order_lock:${mlId}`;

    return this.withFallthrough(
      async (redis) => {
        return await redis.get(key);
      },
      async () => {
        const lock = await prisma.emergencyLock.findUnique({
          where: { key },
        });
        if (lock && lock.expiresAt > new Date()) {
          return lock.userId;
        }
        // Lock expirado, limpiarlo
        if (lock) {
          await prisma.emergencyLock.delete({ where: { key } });
        }
        return null;
      },
    );
  }

  /**
   * Libera el lock de una orden. Fall-through a Postgres.
   */
  static async unlockOrder(mlId: string, userId: string): Promise<void> {
    const key = `order_lock:${mlId}`;

    await this.withFallthrough(
      async (redis) => {
        const currentUser = await redis.get(key);
        if (currentUser === userId) {
          await redis.del(key);
        }
      },
      async () => {
        await prisma.emergencyLock.deleteMany({
          where: { key, userId },
        });
      },
    );
  }

  /**
   * Intenta bloquear una mesa de empaque para un usuario.
   */
  static async lockStation(stationName: string, userId: string, ttlSeconds: number = 28800): Promise<boolean> {
    const key = `station_lock:${stationName}`;

    return this.withFallthrough(
      async (redis) => {
        const result = await redis.set(key, userId, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      },
      async () => {
        // Limpiar locks expirados
        await prisma.emergencyLock.deleteMany({
          where: { expiresAt: { lt: new Date() } },
        });
        try {
          await prisma.emergencyLock.create({
            data: { key, userId, expiresAt: new Date(Date.now() + ttlSeconds * 1000) },
          });
          return true;
        } catch {
          return false;
        }
      },
    );
  }

  /**
   * Libera el bloqueo de una mesa de empaque.
   */
  static async unlockStation(stationName: string, userId: string): Promise<void> {
    const key = `station_lock:${stationName}`;

    await this.withFallthrough(
      async (redis) => {
        const currentUser = await redis.get(key);
        if (currentUser === userId) {
          await redis.del(key);
        }
      },
      async () => {
        await prisma.emergencyLock.deleteMany({
          where: { key, userId },
        });
      },
    );
  }

  /**
   * Obtiene el ID del usuario que tiene bloqueada la mesa.
   */
  static async getStationOwner(stationName: string): Promise<string | null> {
    const key = `station_lock:${stationName}`;

    return this.withFallthrough(
      async (redis) => {
        return await redis.get(key);
      },
      async () => {
        const lock = await prisma.emergencyLock.findUnique({
          where: { key },
        });
        if (lock && lock.expiresAt > new Date()) {
          return lock.userId;
        }
        if (lock) {
          await prisma.emergencyLock.delete({ where: { key } });
        }
        return null;
      },
    );
  }

  // ═══════════════════════════════════════════
  // CACHE GENÉRICO PERSISTENTE (L1=memoria, L2=Redis)
  // ═══════════════════════════════════════════

  /**
   * Lee del cache: primero memoria (L1, rápido), luego Redis (L2, persistente).
   * Si se encuentra en Redis, lo promueve a L1 automáticamente.
   * Retorna null si la clave no existe en ningún nivel.
   */
  static async cacheGet(key: string, label?: string): Promise<string | null> {
    const start = performance.now();
    const tag = label ? `[${label}]` : '';

    // L1: Memoria (rápido, se pierde al reiniciar)
    if (this.memoryCache.has(key)) {
      this.cacheStats.l1Hits++;
      console.log(`[Cache] L1 HIT ${tag} ${key.slice(0, 40)}`);
      return this.memoryCache.get(key) ?? null;
    }

    // L2: Redis (persistente entre reinicios)
    if (this.isRedisDown) {
      this.cacheStats.misses++;
      const elapsed = (performance.now() - start).toFixed(1);
      console.log(`[Cache] MISS (redis down) ${tag} ${key.slice(0, 40)} (${elapsed}ms)`);
      return null;
    }

    try {
      const redis = this.getInstance();
      const value = await redis.get(key);
      const elapsed = (performance.now() - start).toFixed(1);

      if (value !== null) {
        // Promover a L1 para acceso rápido en este ciclo
        this.memoryCache.set(key, value);
        this.cacheStats.l2Hits++;
        console.log(`[Cache] L2 HIT ${tag} ${key.slice(0, 40)} (${elapsed}ms)`);
        return value;
      }

      // Clave no existe en Redis
      this.cacheStats.misses++;
      console.log(`[Cache] MISS ${tag} ${key.slice(0, 40)} (${elapsed}ms)`);
      return null;
    } catch {
      this.isRedisDown = true;
      this.cacheStats.misses++;
      const elapsed = (performance.now() - start).toFixed(1);
      console.log(`[Cache] MISS (error) ${tag} ${key.slice(0, 40)} (${elapsed}ms)`);
      return null;
    }
  }

  /**
   * Escribe en ambos niveles: L1 (memoria) + L2 (Redis).
   * Si Redis está caído, solo escribe en memoria (fallback silencioso).
   * 
   * @param key Clave única
   * @param value Valor a cachear
   * @param ttlSeconds TTL en segundos (default: 7 días para categorías ML que no cambian)
   */
  static async cacheSet(key: string, value: string, ttlSeconds: number = 604800, label?: string): Promise<void> {
    const start = performance.now();
    const tag = label ? `[${label}]` : '';

    // Siempre escribir en L1
    this.memoryCache.set(key, value);

    // Intentar L2 (Redis)
    if (this.isRedisDown) {
      this.cacheStats.setErrors++;
      const elapsed = (performance.now() - start).toFixed(1);
      console.log(`[Cache] SET (redis down) ${tag} ${key.slice(0, 40)} (${elapsed}ms)`);
      return;
    }

    try {
      const redis = this.getInstance();
      await redis.set(key, value, 'EX', ttlSeconds);
      this.cacheStats.sets++;
      const elapsed = (performance.now() - start).toFixed(1);
      console.log(`[Cache] SET ${tag} ${key.slice(0, 40)} (${elapsed}ms)`);
    } catch {
      this.isRedisDown = true;
      this.cacheStats.setErrors++;
      const elapsed = (performance.now() - start).toFixed(1);
      console.log(`[Cache] SET (error) ${tag} ${key.slice(0, 40)} (${elapsed}ms)`);
      // L1 ya tiene el valor, todo bien
    }
  }

  /**
   * Elimina una clave de ambos niveles (L1 + L2).
   */
  static async cacheDel(key: string): Promise<void> {
    this.memoryCache.delete(key);
    console.log(`[Cache] DEL ${key.slice(0, 40)}`);

    if (this.isRedisDown) return;

    try {
      const redis = this.getInstance();
      await redis.del(key);
    } catch {
      this.isRedisDown = true;
    }
  }

  /**
   * Devuelve y resetea las estadísticas acumuladas de cache hits/misses.
   * Útil para monitorear el ratio de aciertos después de un sync.
   */
  static getCacheStats(reset: boolean = true): {
    l1Hits: number;
    l2Hits: number;
    misses: number;
    sets: number;
    setErrors: number;
    totalGets: number;
    hitRate: string;
  } {
    const s = this.cacheStats;
    const totalGets = s.l1Hits + s.l2Hits + s.misses;
    const hits = s.l1Hits + s.l2Hits;
    const hitRate = totalGets > 0 ? ((hits / totalGets) * 100).toFixed(1) + '%' : 'N/A';

    const result = { ...s, totalGets, hitRate };

    if (reset) {
      this.cacheStats = { l1Hits: 0, l2Hits: 0, misses: 0, sets: 0, setErrors: 0 };
    }

    return result;
  }
}

export default RedisManager;
