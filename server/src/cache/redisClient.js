import Redis from 'ioredis';

class CacheManager {
  constructor() {
    this.memoryCache = new Map();
    this.memoryTtls = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
    };
    this.isRedisConnected = false;
    this.initRedis();
  }

  initRedis() {
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null, // Don't crash or spin indefinitely on reconnect
        connectTimeout: 2000,
        lazyConnect: true,
      });

      this.redis.connect()
        .then(() => {
          this.isRedisConnected = true;
          console.log('[Cache] Redis connected successfully');
        })
        .catch((err) => {
          this.isRedisConnected = false;
          console.log(`[Cache] Redis not detected (${err.message}). Seamlessly activated In-Memory High-Performance Cache.`);
        });

      this.redis.on('error', () => {
        this.isRedisConnected = false;
      });
    } catch {
      this.isRedisConnected = false;
    }
  }

  async get(key) {
    if (this.isRedisConnected && this.redis) {
      try {
        const val = await this.redis.get(key);
        if (val !== null) {
          this.stats.hits++;
          return JSON.parse(val);
        }
        this.stats.misses++;
        return null;
      } catch {
        // Fallback to memory
      }
    }

    // Memory cache lookup
    if (this.memoryCache.has(key)) {
      const expiry = this.memoryTtls.get(key);
      if (expiry && Date.now() > expiry) {
        this.memoryCache.delete(key);
        this.memoryTtls.delete(key);
        this.stats.misses++;
        return null;
      }
      this.stats.hits++;
      return this.memoryCache.get(key);
    }

    this.stats.misses++;
    return null;
  }

  async set(key, value, ttlSeconds = 3600) {
    this.stats.sets++;
    if (this.isRedisConnected && this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return true;
      } catch {
        // Fallback to memory
      }
    }

    this.memoryCache.set(key, value);
    if (ttlSeconds > 0) {
      this.memoryTtls.set(key, Date.now() + ttlSeconds * 1000);
    }
    return true;
  }

  async del(key) {
    if (this.isRedisConnected && this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // Continue to memory
      }
    }
    this.memoryCache.delete(key);
    this.memoryTtls.delete(key);
    return true;
  }

  async delPattern(pattern) {
    // Invalidate keys matching pattern
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    
    if (this.isRedisConnected && this.redis) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } catch {
        // Fallback
      }
    }

    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
        this.memoryTtls.delete(key);
      }
    }
    return true;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) : '0.0';
    return {
      ...this.stats,
      totalRequests: total,
      hitRatePercent: parseFloat(hitRate),
      driver: this.isRedisConnected ? 'Redis (Network)' : 'In-Memory (Ultra-Low Latency)',
      cachedKeysCount: this.memoryCache.size,
    };
  }
}

export const cache = new CacheManager();
