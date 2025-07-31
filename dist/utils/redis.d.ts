import { createClient } from 'redis';
export declare class RedisManager {
    private static instance;
    private client;
    private constructor();
    static getInstance(): RedisManager;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    getClient(): ReturnType<typeof createClient>;
    healthCheck(): Promise<boolean>;
}
//# sourceMappingURL=redis.d.ts.map