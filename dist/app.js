"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KRWWManagerApp = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const binanceService_1 = require("./services/binanceService");
const cmeService_1 = require("./services/cmeService");
const hyperliquidService_1 = require("./services/hyperliquidService");
const bybitService_1 = require("./services/bybitService");
const depositMonitor_1 = require("./services/depositMonitor");
const hedgeService_1 = require("./services/hedgeService");
const redis_1 = require("./utils/redis");
const config_1 = require("./config");
const logger_1 = require("./utils/logger");
class KRWWManagerApp {
    constructor() {
        this.app = (0, express_1.default)();
        this.setupMiddleware();
        this.initializeServices();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    setupMiddleware() {
        this.app.use((0, helmet_1.default)());
        this.app.use((0, cors_1.default)());
        this.app.use(express_1.default.json());
        this.app.use(express_1.default.urlencoded({ extended: true }));
        // Request logging
        this.app.use((req, res, next) => {
            logger_1.logger.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            next();
        });
    }
    initializeServices() {
        this.redisManager = redis_1.RedisManager.getInstance();
        this.binanceService = new binanceService_1.BinanceService(config_1.config.binance.apiKey, config_1.config.binance.secretKey, config_1.config.binance.testnet);
        this.cmeService = new cmeService_1.CMEService(config_1.config.cme.apiKey, config_1.config.cme.secretKey, config_1.config.cme.environment);
        this.hyperliquidService = new hyperliquidService_1.HyperliquidService(config_1.config.hyperliquid.privateKey, config_1.config.hyperliquid.walletAddress, config_1.config.hyperliquid.testnet);
        this.bybitService = new bybitService_1.BybitService(config_1.config.bybit.apiKey, config_1.config.bybit.secretKey, config_1.config.bybit.testnet);
        this.depositMonitor = new depositMonitor_1.DepositMonitor(config_1.config.ethereum.rpcUrl, config_1.config.ethereum.depositContractAddress, this.redisManager.getClient());
        this.hedgeService = new hedgeService_1.HedgeService(this.binanceService, this.cmeService, this.hyperliquidService, this.bybitService, this.redisManager.getClient());
    }
    setupRoutes() {
        // Health check
        this.app.get('/health', async (req, res) => {
            try {
                const redisHealth = await this.redisManager.healthCheck();
                res.json({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    services: {
                        redis: redisHealth ? 'ok' : 'error'
                    }
                });
            }
            catch (error) {
                res.status(500).json({
                    status: 'error',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
        // Get deposit history
        this.app.get('/api/deposits', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 100;
                const deposits = await this.depositMonitor.getDepositHistory(limit);
                res.json({ deposits });
            }
            catch (error) {
                logger_1.logger.error('Failed to get deposit history:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Get deposit by transaction hash
        this.app.get('/api/deposits/:txHash', async (req, res) => {
            try {
                const { txHash } = req.params;
                const deposit = await this.depositMonitor.getDepositByTxHash(txHash);
                if (!deposit) {
                    return res.status(404).json({ error: 'Deposit not found' });
                }
                res.json({ deposit });
            }
            catch (error) {
                logger_1.logger.error('Failed to get deposit:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Get hedge positions for a deposit
        this.app.get('/api/hedges/:txHash', async (req, res) => {
            try {
                const { txHash } = req.params;
                const positions = await this.hedgeService.getHedgeByTxHash(txHash);
                const hedgeLog = await this.hedgeService.getHedgeLog(txHash);
                res.json({
                    positions,
                    log: hedgeLog
                });
            }
            catch (error) {
                logger_1.logger.error('Failed to get hedge positions:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Close hedge positions
        this.app.post('/api/hedges/:txHash/close', async (req, res) => {
            try {
                const { txHash } = req.params;
                const success = await this.hedgeService.closeHedgePositions(txHash);
                res.json({
                    success,
                    message: success ? 'All positions closed' : 'Some positions failed to close'
                });
            }
            catch (error) {
                logger_1.logger.error('Failed to close hedge positions:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Get Binance account info
        this.app.get('/api/binance/account', async (req, res) => {
            try {
                const balance = await this.binanceService.getAccountBalance();
                res.json({ balance });
            }
            catch (error) {
                logger_1.logger.error('Failed to get Binance account info:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Get CME account info
        this.app.get('/api/cme/account', async (req, res) => {
            try {
                const accountInfo = await this.cmeService.getAccountInfo();
                res.json({ accountInfo });
            }
            catch (error) {
                logger_1.logger.error('Failed to get CME account info:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Get Hyperliquid account info
        this.app.get('/api/hyperliquid/account', async (req, res) => {
            try {
                const accountInfo = await this.hyperliquidService.getAccountInfo();
                res.json({ accountInfo });
            }
            catch (error) {
                logger_1.logger.error('Failed to get Hyperliquid account info:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Get Hyperliquid positions
        this.app.get('/api/hyperliquid/positions', async (req, res) => {
            try {
                const positions = await this.hyperliquidService.getPositions();
                res.json({ positions });
            }
            catch (error) {
                logger_1.logger.error('Failed to get Hyperliquid positions:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Get Bybit account info
        this.app.get('/api/bybit/account', async (req, res) => {
            try {
                const accountInfo = await this.bybitService.getAccountInfo();
                res.json({ accountInfo });
            }
            catch (error) {
                logger_1.logger.error('Failed to get Bybit account info:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // Get Bybit positions
        this.app.get('/api/bybit/positions', async (req, res) => {
            try {
                const positions = await this.bybitService.getPositions();
                res.json({ positions });
            }
            catch (error) {
                logger_1.logger.error('Failed to get Bybit positions:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }
    setupErrorHandling() {
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({ error: 'Route not found' });
        });
        // Global error handler
        this.app.use((err, req, res, next) => {
            logger_1.logger.error('Unhandled error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }
    async start() {
        try {
            (0, config_1.validateConfig)();
            // Connect to Redis
            await this.redisManager.connect();
            // Start services
            await this.depositMonitor.start();
            await this.hedgeService.start();
            // Start HTTP server
            const port = config_1.config.server.port;
            this.app.listen(port, () => {
                logger_1.logger.info(`KRWW Manager server started on port ${port}`);
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to start application:', error);
            throw error;
        }
    }
    async stop() {
        try {
            await this.depositMonitor.stop();
            await this.hedgeService.stop();
            await this.redisManager.disconnect();
            logger_1.logger.info('KRWW Manager application stopped');
        }
        catch (error) {
            logger_1.logger.error('Error stopping application:', error);
        }
    }
    getApp() {
        return this.app;
    }
}
exports.KRWWManagerApp = KRWWManagerApp;
//# sourceMappingURL=app.js.map