"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BybitService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
const crypto_1 = __importDefault(require("crypto"));
class BybitService {
    constructor(apiKey, secretKey, testnet = false) {
        this.apiKey = apiKey;
        this.secretKey = secretKey;
        this.isTestnet = testnet;
        const baseURL = testnet
            ? 'https://api-testnet.bybit.com'
            : 'https://api.bybit.com';
        this.apiClient = axios_1.default.create({
            baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'X-BAPI-API-KEY': apiKey
            }
        });
        // Add request interceptor for authentication
        this.apiClient.interceptors.request.use((config) => {
            const timestamp = Date.now().toString();
            const method = config.method?.toUpperCase() || 'GET';
            const path = config.url || '';
            const queryString = config.params ? new URLSearchParams(config.params).toString() : '';
            const bodyString = config.data ? JSON.stringify(config.data) : '';
            let paramString = '';
            if (method === 'GET' && queryString) {
                paramString = queryString;
            }
            else if (method === 'POST' && bodyString) {
                paramString = bodyString;
            }
            const signString = timestamp + this.apiKey + paramString;
            const signature = crypto_1.default
                .createHmac('sha256', this.secretKey)
                .update(signString)
                .digest('hex');
            config.headers['X-BAPI-TIMESTAMP'] = timestamp;
            config.headers['X-BAPI-SIGN'] = signature;
            return config;
        });
    }
    async createShortPosition(symbol, ethAmount) {
        try {
            logger_1.logger.info(`Creating short position on Bybit: ${symbol}, amount: ${ethAmount} ETH`);
            // Get current market price
            const tickerData = await this.getTicker(symbol);
            const currentPrice = parseFloat(tickerData.lastPrice);
            // Get instrument info for precision
            const instrumentInfo = await this.getInstrumentInfo(symbol);
            const qtyStep = parseFloat(instrumentInfo.lotSizeFilter.qtyStep);
            // Calculate position size with proper precision
            let positionSize = Math.floor(ethAmount / qtyStep) * qtyStep;
            positionSize = Math.max(positionSize, parseFloat(instrumentInfo.lotSizeFilter.minOrderQty));
            const orderRequest = {
                category: 'linear',
                symbol: symbol,
                side: 'Sell', // Short position
                orderType: 'Market',
                qty: positionSize.toString(),
                timeInForce: 'IOC'
            };
            const response = await this.apiClient.post('/v5/order/create', orderRequest);
            const orderResult = response.data;
            if (orderResult.retCode === 0) {
                const hedgePosition = {
                    id: `bybit_${orderResult.result.orderId}`,
                    type: 'bybit',
                    symbol,
                    side: 'short',
                    amount: positionSize,
                    price: currentPrice,
                    status: 'pending', // Will be updated when we check order status
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                // Check if order was filled immediately
                const orderStatus = await this.getOrderStatus(symbol, orderResult.result.orderId);
                if (orderStatus.orderStatus === 'Filled') {
                    hedgePosition.status = 'open';
                    hedgePosition.price = parseFloat(orderStatus.avgPrice);
                }
                logger_1.logger.info(`Bybit short position created: ${hedgePosition.id}`);
                return hedgePosition;
            }
            else {
                throw new Error(`Bybit order failed: ${orderResult.retMsg}`);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to create Bybit short position:', error);
            // Return failed position for tracking
            const failedPosition = {
                id: `bybit_failed_${Date.now()}`,
                type: 'bybit',
                symbol,
                side: 'short',
                amount: ethAmount,
                price: 0,
                status: 'failed',
                createdAt: new Date(),
                updatedAt: new Date()
            };
            return failedPosition;
        }
    }
    async closePosition(symbol, positionSize, orderId) {
        try {
            logger_1.logger.info(`Closing Bybit position: ${symbol}, size: ${positionSize}`);
            const orderRequest = {
                category: 'linear',
                symbol: symbol,
                side: 'Buy', // Buy to close short
                orderType: 'Market',
                qty: positionSize.toString(),
                reduceOnly: true,
                timeInForce: 'IOC'
            };
            const response = await this.apiClient.post('/v5/order/create', orderRequest);
            const orderResult = response.data;
            if (orderResult.retCode === 0) {
                // Wait a bit and check if order was filled
                await this.sleep(1000);
                const orderStatus = await this.getOrderStatus(symbol, orderResult.result.orderId);
                const success = orderStatus.orderStatus === 'Filled';
                logger_1.logger.info(`Bybit position ${success ? 'closed' : 'close pending'}`);
                return success;
            }
            else {
                logger_1.logger.error(`Bybit close order failed: ${orderResult.retMsg}`);
                return false;
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to close Bybit position:', error);
            return false;
        }
    }
    async getTicker(symbol) {
        try {
            const response = await this.apiClient.get('/v5/market/tickers', {
                params: {
                    category: 'linear',
                    symbol: symbol
                }
            });
            if (response.data.retCode === 0 && response.data.result.list.length > 0) {
                return response.data.result.list[0];
            }
            else {
                throw new Error(`Failed to get ticker for ${symbol}`);
            }
        }
        catch (error) {
            logger_1.logger.error(`Failed to get ticker for ${symbol}:`, error);
            throw error;
        }
    }
    async getInstrumentInfo(symbol) {
        try {
            const response = await this.apiClient.get('/v5/market/instruments-info', {
                params: {
                    category: 'linear',
                    symbol: symbol
                }
            });
            if (response.data.retCode === 0 && response.data.result.list.length > 0) {
                return response.data.result.list[0];
            }
            else {
                throw new Error(`Failed to get instrument info for ${symbol}`);
            }
        }
        catch (error) {
            logger_1.logger.error(`Failed to get instrument info for ${symbol}:`, error);
            throw error;
        }
    }
    async getOrderStatus(symbol, orderId) {
        try {
            const response = await this.apiClient.get('/v5/order/realtime', {
                params: {
                    category: 'linear',
                    symbol: symbol,
                    orderId: orderId
                }
            });
            if (response.data.retCode === 0 && response.data.result.list.length > 0) {
                return response.data.result.list[0];
            }
            else {
                throw new Error(`Failed to get order status for ${orderId}`);
            }
        }
        catch (error) {
            logger_1.logger.error(`Failed to get order status for ${orderId}:`, error);
            throw error;
        }
    }
    async getAccountInfo() {
        try {
            const response = await this.apiClient.get('/v5/account/wallet-balance', {
                params: {
                    accountType: 'UNIFIED'
                }
            });
            if (response.data.retCode === 0) {
                return response.data.result;
            }
            else {
                throw new Error(`Failed to get account info: ${response.data.retMsg}`);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to get Bybit account info:', error);
            throw error;
        }
    }
    async getPositions(symbol) {
        try {
            const params = {
                category: 'linear'
            };
            if (symbol) {
                params.symbol = symbol;
            }
            const response = await this.apiClient.get('/v5/position/list', { params });
            if (response.data.retCode === 0) {
                return response.data.result.list || [];
            }
            else {
                throw new Error(`Failed to get positions: ${response.data.retMsg}`);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to get Bybit positions:', error);
            return [];
        }
    }
    async getOrderHistory(symbol, limit = 50) {
        try {
            const params = {
                category: 'linear',
                limit: limit.toString()
            };
            if (symbol) {
                params.symbol = symbol;
            }
            const response = await this.apiClient.get('/v5/order/history', { params });
            if (response.data.retCode === 0) {
                return response.data.result.list || [];
            }
            else {
                throw new Error(`Failed to get order history: ${response.data.retMsg}`);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to get Bybit order history:', error);
            return [];
        }
    }
    async getCurrentPrice(symbol) {
        try {
            const ticker = await this.getTicker(symbol);
            return parseFloat(ticker.lastPrice);
        }
        catch (error) {
            logger_1.logger.error(`Failed to get current price for ${symbol}:`, error);
            throw error;
        }
    }
    async cancelAllOrders(symbol) {
        try {
            const params = {
                category: 'linear'
            };
            if (symbol) {
                params.symbol = symbol;
            }
            const response = await this.apiClient.post('/v5/order/cancel-all', params);
            if (response.data.retCode === 0) {
                logger_1.logger.info(`Cancelled all orders ${symbol ? `for ${symbol}` : ''}`);
                return true;
            }
            else {
                logger_1.logger.error(`Failed to cancel orders: ${response.data.retMsg}`);
                return false;
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to cancel orders:', error);
            return false;
        }
    }
    async getServerTime() {
        try {
            const response = await this.apiClient.get('/v5/market/time');
            if (response.data.retCode === 0) {
                return parseInt(response.data.result.timeSecond) * 1000;
            }
            else {
                throw new Error(`Failed to get server time: ${response.data.retMsg}`);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to get server time:', error);
            return Date.now();
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.BybitService = BybitService;
//# sourceMappingURL=bybitService.js.map