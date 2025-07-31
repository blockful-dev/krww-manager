"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisManager = void 0;
const redis_1 = require("redis");
const config_1 = require("../config");
const logger_1 = require("./logger");
class RedisManager {
    constructor() {
        this.client = (0, redis_1.createClient)({
            url: config_1.config.redis.url
        });
        this.client.on('error', (err) => {
            logger_1.logger.error('Redis Client Error:', err);
        });
        this.client.on('connect', () => {
            logger_1.logger.info('Redis Client Connected');
        });
        this.client.on('disconnect', () => {
            logger_1.logger.warn('Redis Client Disconnected');
        });
    }
    static getInstance() {
        if (!RedisManager.instance) {
            RedisManager.instance = new RedisManager();
        }
        return RedisManager.instance;
    }
    async connect() {
        if (!this.client.isOpen) {
            await this.client.connect();
        }
    }
    async disconnect() {
        if (this.client.isOpen) {
            await this.client.disconnect();
        }
    }
    getClient() {
        return this.client;
    }
    async healthCheck() {
        try {
            const pong = await this.client.ping();
            return pong === 'PONG';
        }
        catch (error) {
            logger_1.logger.error('Redis health check failed:', error);
            return false;
        }
    }
}
exports.RedisManager = RedisManager;
//# sourceMappingURL=redis.js.map