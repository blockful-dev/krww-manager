"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceService = void 0;
const binance_api_node_1 = __importDefault(require("binance-api-node"));
const logger_1 = require("../utils/logger");
class BinanceService {
    constructor(apiKey, secretKey, testnet = false) {
        this.isTestnet = testnet;
        this.client = (0, binance_api_node_1.default)({
            apiKey,
            apiSecret: secretKey,
            ...(testnet && { httpBase: 'https://testnet.binance.vision' })
        });
    }
    async createShortPosition(symbol, ethAmount) {
        try {
            logger_1.logger.info(`Creating short position on Binance: ${symbol}, amount: ${ethAmount} ETH`);
            const exchangeInfo = await this.client.exchangeInfo();
            const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);
            if (!symbolInfo) {
                throw new Error(`Symbol ${symbol} not found on Binance`);
            }
            const ticker = await this.client.prices({ symbol });
            const currentPrice = parseFloat(ticker[symbol]);
            const lotSize = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
            const minQty = lotSize ? parseFloat(lotSize.minQty) : 0.001;
            const stepSize = lotSize ? parseFloat(lotSize.stepSize) : 0.001;
            let quantity = Math.floor(ethAmount / stepSize) * stepSize;
            quantity = Math.max(quantity, minQty);
            const order = await this.client.order({
                symbol,
                side: 'SELL',
                type: 'MARKET',
                quantity: quantity.toString()
            });
            const hedgePosition = {
                id: `binance_${order.orderId}`,
                type: 'binance',
                symbol,
                side: 'short',
                amount: parseFloat(order.executedQty),
                price: parseFloat(order.cummulativeQuoteQty) / parseFloat(order.executedQty),
                status: order.status === 'FILLED' ? 'open' : 'pending',
                createdAt: new Date(order.transactTime || Date.now()),
                updatedAt: new Date(order.transactTime || Date.now())
            };
            logger_1.logger.info(`Binance short position created: ${hedgePosition.id}`);
            return hedgePosition;
        }
        catch (error) {
            logger_1.logger.error('Failed to create Binance short position:', error);
            throw new Error(`Binance short position failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async closePosition(orderId, symbol, quantity) {
        try {
            logger_1.logger.info(`Closing Binance position: ${orderId}`);
            const order = await this.client.order({
                symbol,
                side: 'BUY',
                type: 'MARKET',
                quantity: quantity.toString()
            });
            logger_1.logger.info(`Binance position closed: ${order.orderId}`);
            return order.status === 'FILLED';
        }
        catch (error) {
            logger_1.logger.error('Failed to close Binance position:', error);
            return false;
        }
    }
    async getAccountBalance() {
        try {
            const account = await this.client.accountInfo();
            return account.balances.filter(balance => parseFloat(balance.free) > 0);
        }
        catch (error) {
            logger_1.logger.error('Failed to get Binance account balance:', error);
            throw error;
        }
    }
    async getOrderStatus(symbol, orderId) {
        try {
            return await this.client.getOrder({ symbol, orderId });
        }
        catch (error) {
            logger_1.logger.error('Failed to get Binance order status:', error);
            throw error;
        }
    }
    async getExchangeInfo() {
        try {
            return await this.client.exchangeInfo();
        }
        catch (error) {
            logger_1.logger.error('Failed to get Binance exchange info:', error);
            throw error;
        }
    }
    async getCurrentPrice(symbol) {
        try {
            const ticker = await this.client.prices({ symbol });
            return parseFloat(ticker[symbol]);
        }
        catch (error) {
            logger_1.logger.error(`Failed to get current price for ${symbol}:`, error);
            throw error;
        }
    }
}
exports.BinanceService = BinanceService;
//# sourceMappingURL=binanceService.js.map