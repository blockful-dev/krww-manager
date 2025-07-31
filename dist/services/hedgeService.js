"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HedgeService = void 0;
const logger_1 = require("../utils/logger");
class HedgeService {
    constructor(binanceService, cmeService, hyperliquidService, bybitService, redisClient) {
        this.isProcessing = false;
        this.binanceService = binanceService;
        this.cmeService = cmeService;
        this.hyperliquidService = hyperliquidService;
        this.bybitService = bybitService;
        this.redis = redisClient;
    }
    async start() {
        if (this.isProcessing) {
            logger_1.logger.warn('Hedge service is already running');
            return;
        }
        this.isProcessing = true;
        logger_1.logger.info('Starting hedge service processor');
        // Start processing hedge requests
        this.processHedgeRequests();
    }
    async stop() {
        this.isProcessing = false;
        logger_1.logger.info('Hedge service stopped');
    }
    async processHedgeRequests() {
        while (this.isProcessing) {
            try {
                // Get next hedge request from queue
                const requestData = await this.redis.brPop('hedge_requests', 5); // 5 second timeout
                if (requestData) {
                    const hedgeRequest = JSON.parse(requestData.element);
                    await this.executeHedge(hedgeRequest);
                }
            }
            catch (error) {
                logger_1.logger.error('Error processing hedge requests:', error);
                // Continue processing even if one request fails
                await this.sleep(1000);
            }
        }
    }
    async executeHedge(request) {
        logger_1.logger.info(`Executing hedge for deposit: ${request.depositTxHash}`);
        try {
            // Check if hedge already exists for this deposit
            const existingHedge = await this.getHedgeByTxHash(request.depositTxHash);
            if (existingHedge.length > 0) {
                logger_1.logger.warn(`Hedge already exists for deposit: ${request.depositTxHash}`);
                return;
            }
            // Execute all four hedges concurrently
            const hedgePromises = [
                this.executeBinanceHedge(request),
                this.executeCMEHedge(request),
                this.executeHyperliquidHedge(request),
                this.executeBybitHedge(request)
            ];
            const results = await Promise.allSettled(hedgePromises);
            let successCount = 0;
            const hedgePositions = [];
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successCount++;
                    hedgePositions.push(result.value);
                    const platformName = index === 0 ? 'Binance' : index === 1 ? 'CME' : index === 2 ? 'Hyperliquid' : 'Bybit';
                    logger_1.logger.info(`${platformName} hedge successful`);
                }
                else {
                    const platformName = index === 0 ? 'Binance' : index === 1 ? 'CME' : index === 2 ? 'Hyperliquid' : 'Bybit';
                    logger_1.logger.error(`${platformName} hedge failed:`, result.reason);
                }
            });
            // Store hedge positions
            for (const position of hedgePositions) {
                await this.storeHedgePosition(request.depositTxHash, position);
            }
            // Log hedge execution result
            await this.logHedgeExecution(request, hedgePositions, successCount);
            if (successCount === 0) {
                logger_1.logger.error(`All hedges failed for deposit: ${request.depositTxHash}`);
                // Could implement retry logic or alerting here
            }
            else if (successCount === 1) {
                logger_1.logger.warn(`Partial hedge success for deposit: ${request.depositTxHash}`);
            }
            else {
                logger_1.logger.info(`Full hedge success for deposit: ${request.depositTxHash}`);
            }
        }
        catch (error) {
            logger_1.logger.error(`Failed to execute hedge for deposit ${request.depositTxHash}:`, error);
        }
    }
    async executeBinanceHedge(request) {
        try {
            // Use ETHUSDT for ETH short position
            const position = await this.binanceService.createShortPosition('ETHUSDT', request.ethAmount);
            logger_1.logger.info(`Binance ETH short position created: ${position.id}`);
            return position;
        }
        catch (error) {
            logger_1.logger.error('Binance hedge execution failed:', error);
            throw error;
        }
    }
    async executeCMEHedge(request) {
        try {
            // Convert ETH amount to USD value for KRW/USD hedge
            const ethPrice = await this.binanceService.getCurrentPrice('ETHUSDT');
            const usdValue = request.ethAmount * ethPrice;
            const position = await this.cmeService.createKRWUSDShortPosition(usdValue);
            logger_1.logger.info(`CME KRW/USD short position created: ${position.id}`);
            return position;
        }
        catch (error) {
            logger_1.logger.error('CME hedge execution failed:', error);
            throw error;
        }
    }
    async executeHyperliquidHedge(request) {
        try {
            // Use ETH for ETH short position on Hyperliquid
            const position = await this.hyperliquidService.createShortPosition('ETH', request.ethAmount);
            logger_1.logger.info(`Hyperliquid ETH short position created: ${position.id}`);
            return position;
        }
        catch (error) {
            logger_1.logger.error('Hyperliquid hedge execution failed:', error);
            throw error;
        }
    }
    async executeBybitHedge(request) {
        try {
            // Use ETHUSDT for ETH short position on Bybit
            const position = await this.bybitService.createShortPosition('ETHUSDT', request.ethAmount);
            logger_1.logger.info(`Bybit ETH short position created: ${position.id}`);
            return position;
        }
        catch (error) {
            logger_1.logger.error('Bybit hedge execution failed:', error);
            throw error;
        }
    }
    async storeHedgePosition(txHash, position) {
        try {
            const key = `hedge:${txHash}:${position.type}`;
            await this.redis.setEx(key, 86400 * 30, JSON.stringify(position)); // Store for 30 days
            // Add to hedge index
            await this.redis.sAdd(`hedge_index:${txHash}`, position.id);
        }
        catch (error) {
            logger_1.logger.error('Failed to store hedge position:', error);
        }
    }
    async logHedgeExecution(request, positions, successCount) {
        try {
            const executionLog = {
                txHash: request.depositTxHash,
                ethAmount: request.ethAmount,
                krwwAmount: request.krwwAmount,
                userAddress: request.userAddress,
                positions: positions,
                successCount: successCount,
                totalHedges: 2,
                timestamp: Date.now()
            };
            const key = `hedge_log:${request.depositTxHash}`;
            await this.redis.setEx(key, 86400 * 30, JSON.stringify(executionLog));
        }
        catch (error) {
            logger_1.logger.error('Failed to log hedge execution:', error);
        }
    }
    async getHedgeByTxHash(txHash) {
        try {
            const positionIds = await this.redis.sMembers(`hedge_index:${txHash}`);
            const positions = [];
            for (const positionId of positionIds) {
                const [type] = positionId.split('_');
                const key = `hedge:${txHash}:${type}`;
                const positionData = await this.redis.get(key);
                if (positionData) {
                    positions.push(JSON.parse(positionData));
                }
            }
            return positions;
        }
        catch (error) {
            logger_1.logger.error('Failed to get hedge by tx hash:', error);
            return [];
        }
    }
    async getHedgeLog(txHash) {
        try {
            const logData = await this.redis.get(`hedge_log:${txHash}`);
            return logData ? JSON.parse(logData) : null;
        }
        catch (error) {
            logger_1.logger.error('Failed to get hedge log:', error);
            return null;
        }
    }
    async closeHedgePositions(txHash) {
        try {
            const positions = await this.getHedgeByTxHash(txHash);
            let allClosed = true;
            for (const position of positions) {
                try {
                    let success = false;
                    if (position.type === 'binance') {
                        success = await this.binanceService.closePosition(position.id.replace('binance_', ''), position.symbol, position.amount);
                    }
                    else if (position.type === 'cme') {
                        success = await this.cmeService.closePosition(position.id.replace('cme_', ''), position.amount);
                    }
                    else if (position.type === 'hyperliquid') {
                        success = await this.hyperliquidService.closePosition(position.symbol, position.amount);
                    }
                    else if (position.type === 'bybit') {
                        success = await this.bybitService.closePosition(position.symbol, position.amount);
                    }
                    if (!success) {
                        allClosed = false;
                        logger_1.logger.error(`Failed to close ${position.type} position: ${position.id}`);
                    }
                    else {
                        logger_1.logger.info(`Closed ${position.type} position: ${position.id}`);
                    }
                }
                catch (error) {
                    allClosed = false;
                    logger_1.logger.error(`Error closing position ${position.id}:`, error);
                }
            }
            return allClosed;
        }
        catch (error) {
            logger_1.logger.error('Failed to close hedge positions:', error);
            return false;
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.HedgeService = HedgeService;
//# sourceMappingURL=hedgeService.js.map