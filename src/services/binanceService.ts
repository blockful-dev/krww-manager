import Binance from 'binance-api-node';
import { BinanceOrderResponse, HedgePosition } from '../types';
import { logger } from '../utils/logger';

export class BinanceService {
  private client: ReturnType<typeof Binance>;
  private isTestnet: boolean;

  constructor(apiKey: string, secretKey: string, testnet: boolean = false) {
    this.isTestnet = testnet;
    this.client = Binance({
      apiKey,
      apiSecret: secretKey,
      ...(testnet && { httpBase: 'https://testnet.binance.vision' })
    });
  }

  async createShortPosition(symbol: string, ethAmount: number): Promise<HedgePosition> {
    try {
      logger.info(`Creating short position on Binance: ${symbol}, amount: ${ethAmount} ETH`);

      const exchangeInfo = await this.client.exchangeInfo();
      const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === symbol);

      if (!symbolInfo) {
        throw new Error(`Symbol ${symbol} not found on Binance`);
      }

      const ticker = await this.client.prices({ symbol });
      const currentPrice = parseFloat(ticker[symbol]);

      const lotSize = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE') as any;
      const minQty = lotSize ? parseFloat(lotSize.minQty) : 0.001;
      const stepSize = lotSize ? parseFloat(lotSize.stepSize) : 0.001;

      let quantity = Math.floor(ethAmount / stepSize) * stepSize;
      quantity = Math.max(quantity, minQty);

      const order = await this.client.order({
        symbol,
        side: 'SELL',
        type: 'MARKET' as any,
        quantity: quantity.toString()
      });

      const hedgePosition: HedgePosition = {
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

      logger.info(`Binance short position created: ${hedgePosition.id}`);
      return hedgePosition;

    } catch (error) {
      logger.error('Failed to create Binance short position:', error);
      throw new Error(`Binance short position failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async closePosition(orderId: string, symbol: string, quantity: number): Promise<boolean> {
    try {
      logger.info(`Closing Binance position: ${orderId}`);

      const order = await this.client.order({
        symbol,
        side: 'BUY',
        type: 'MARKET' as any,
        quantity: quantity.toString()
      });

      logger.info(`Binance position closed: ${order.orderId}`);
      return order.status === 'FILLED';

    } catch (error) {
      logger.error('Failed to close Binance position:', error);
      return false;
    }
  }

  async getAccountBalance(): Promise<any> {
    try {
      const account = await this.client.accountInfo();
      return account.balances.filter(balance => parseFloat(balance.free) > 0);
    } catch (error) {
      logger.error('Failed to get Binance account balance:', error);
      throw error;
    }
  }

  async getOrderStatus(symbol: string, orderId: number): Promise<any> {
    try {
      return await this.client.getOrder({ symbol, orderId });
    } catch (error) {
      logger.error('Failed to get Binance order status:', error);
      throw error;
    }
  }

  async getExchangeInfo(): Promise<any> {
    try {
      return await this.client.exchangeInfo();
    } catch (error) {
      logger.error('Failed to get Binance exchange info:', error);
      throw error;
    }
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const ticker = await this.client.prices({ symbol });
      return parseFloat(ticker[symbol]);
    } catch (error) {
      logger.error(`Failed to get current price for ${symbol}:`, error);
      throw error;
    }
  }
}