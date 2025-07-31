import axios, { AxiosInstance } from 'axios';
import { HedgePosition } from '../types';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface BybitOrderRequest {
  category: 'linear' | 'inverse' | 'option' | 'spot';
  symbol: string;
  side: 'Buy' | 'Sell';
  orderType: 'Market' | 'Limit';
  qty: string;
  price?: string;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  reduceOnly?: boolean;
  closeOnTrigger?: boolean;
}

interface BybitOrderResponse {
  retCode: number;
  retMsg: string;
  result: {
    orderId: string;
    orderLinkId: string;
  };
  retExtInfo: any;
  time: number;
}

export class BybitService {
  private apiClient: AxiosInstance;
  private apiKey: string;
  private secretKey: string;
  private isTestnet: boolean;

  constructor(apiKey: string, secretKey: string, testnet: boolean = false) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.isTestnet = testnet;

    const baseURL = testnet
      ? 'https://api-testnet.bybit.com'
      : 'https://api.bybit.com';

    this.apiClient = axios.create({
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
      } else if (method === 'POST' && bodyString) {
        paramString = bodyString;
      }

      const signString = timestamp + this.apiKey + paramString;
      const signature = crypto
        .createHmac('sha256', this.secretKey)
        .update(signString)
        .digest('hex');

      config.headers['X-BAPI-TIMESTAMP'] = timestamp;
      config.headers['X-BAPI-SIGN'] = signature;

      return config;
    });
  }

  async createShortPosition(symbol: string, ethAmount: number): Promise<HedgePosition> {
    try {
      logger.info(`Creating short position on Bybit: ${symbol}, amount: ${ethAmount} ETH`);

      // Get current market price
      const tickerData = await this.getTicker(symbol);
      const currentPrice = parseFloat(tickerData.lastPrice);

      // Get instrument info for precision
      const instrumentInfo = await this.getInstrumentInfo(symbol);
      const qtyStep = parseFloat(instrumentInfo.lotSizeFilter.qtyStep);

      // Calculate position size with proper precision
      let positionSize = Math.floor(ethAmount / qtyStep) * qtyStep;
      positionSize = Math.max(positionSize, parseFloat(instrumentInfo.lotSizeFilter.minOrderQty));

      const orderRequest: BybitOrderRequest = {
        category: 'linear',
        symbol: symbol,
        side: 'Sell', // Short position
        orderType: 'Market',
        qty: positionSize.toString(),
        timeInForce: 'IOC'
      };

      const response = await this.apiClient.post('/v5/order/create', orderRequest);
      const orderResult: BybitOrderResponse = response.data;

      if (orderResult.retCode === 0) {
        const hedgePosition: HedgePosition = {
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

        logger.info(`Bybit short position created: ${hedgePosition.id}`);
        return hedgePosition;

      } else {
        throw new Error(`Bybit order failed: ${orderResult.retMsg}`);
      }

    } catch (error) {
      logger.error('Failed to create Bybit short position:', error);

      // Return failed position for tracking
      const failedPosition: HedgePosition = {
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

  async closePosition(symbol: string, positionSize: number, orderId?: string): Promise<boolean> {
    try {
      logger.info(`Closing Bybit position: ${symbol}, size: ${positionSize}`);

      const orderRequest: BybitOrderRequest = {
        category: 'linear',
        symbol: symbol,
        side: 'Buy', // Buy to close short
        orderType: 'Market',
        qty: positionSize.toString(),
        reduceOnly: true,
        timeInForce: 'IOC'
      };

      const response = await this.apiClient.post('/v5/order/create', orderRequest);
      const orderResult: BybitOrderResponse = response.data;

      if (orderResult.retCode === 0) {
        // Wait a bit and check if order was filled
        await this.sleep(1000);
        const orderStatus = await this.getOrderStatus(symbol, orderResult.result.orderId);
        const success = orderStatus.orderStatus === 'Filled';

        logger.info(`Bybit position ${success ? 'closed' : 'close pending'}`);
        return success;
      } else {
        logger.error(`Bybit close order failed: ${orderResult.retMsg}`);
        return false;
      }

    } catch (error) {
      logger.error('Failed to close Bybit position:', error);
      return false;
    }
  }

  async getTicker(symbol: string): Promise<any> {
    try {
      const response = await this.apiClient.get('/v5/market/tickers', {
        params: {
          category: 'linear',
          symbol: symbol
        }
      });

      if (response.data.retCode === 0 && response.data.result.list.length > 0) {
        return response.data.result.list[0];
      } else {
        throw new Error(`Failed to get ticker for ${symbol}`);
      }
    } catch (error) {
      logger.error(`Failed to get ticker for ${symbol}:`, error);
      throw error;
    }
  }

  async getInstrumentInfo(symbol: string): Promise<any> {
    try {
      const response = await this.apiClient.get('/v5/market/instruments-info', {
        params: {
          category: 'linear',
          symbol: symbol
        }
      });

      if (response.data.retCode === 0 && response.data.result.list.length > 0) {
        return response.data.result.list[0];
      } else {
        throw new Error(`Failed to get instrument info for ${symbol}`);
      }
    } catch (error) {
      logger.error(`Failed to get instrument info for ${symbol}:`, error);
      throw error;
    }
  }

  async getOrderStatus(symbol: string, orderId: string): Promise<any> {
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
      } else {
        throw new Error(`Failed to get order status for ${orderId}`);
      }
    } catch (error) {
      logger.error(`Failed to get order status for ${orderId}:`, error);
      throw error;
    }
  }

  async getAccountInfo(): Promise<any> {
    try {
      const response = await this.apiClient.get('/v5/account/wallet-balance', {
        params: {
          accountType: 'UNIFIED'
        }
      });

      if (response.data.retCode === 0) {
        return response.data.result;
      } else {
        throw new Error(`Failed to get account info: ${response.data.retMsg}`);
      }
    } catch (error) {
      logger.error('Failed to get Bybit account info:', error);
      throw error;
    }
  }

  async getPositions(symbol?: string): Promise<any[]> {
    try {
      const params: any = {
        category: 'linear'
      };

      if (symbol) {
        params.symbol = symbol;
      }

      const response = await this.apiClient.get('/v5/position/list', { params });

      if (response.data.retCode === 0) {
        return response.data.result.list || [];
      } else {
        throw new Error(`Failed to get positions: ${response.data.retMsg}`);
      }
    } catch (error) {
      logger.error('Failed to get Bybit positions:', error);
      return [];
    }
  }

  async getOrderHistory(symbol?: string, limit: number = 50): Promise<any[]> {
    try {
      const params: any = {
        category: 'linear',
        limit: limit.toString()
      };

      if (symbol) {
        params.symbol = symbol;
      }

      const response = await this.apiClient.get('/v5/order/history', { params });

      if (response.data.retCode === 0) {
        return response.data.result.list || [];
      } else {
        throw new Error(`Failed to get order history: ${response.data.retMsg}`);
      }
    } catch (error) {
      logger.error('Failed to get Bybit order history:', error);
      return [];
    }
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const ticker = await this.getTicker(symbol);
      return parseFloat(ticker.lastPrice);
    } catch (error) {
      logger.error(`Failed to get current price for ${symbol}:`, error);
      throw error;
    }
  }

  async cancelAllOrders(symbol?: string): Promise<boolean> {
    try {
      const params: any = {
        category: 'linear'
      };

      if (symbol) {
        params.symbol = symbol;
      }

      const response = await this.apiClient.post('/v5/order/cancel-all', params);

      if (response.data.retCode === 0) {
        logger.info(`Cancelled all orders ${symbol ? `for ${symbol}` : ''}`);
        return true;
      } else {
        logger.error(`Failed to cancel orders: ${response.data.retMsg}`);
        return false;
      }
    } catch (error) {
      logger.error('Failed to cancel orders:', error);
      return false;
    }
  }

  async getServerTime(): Promise<number> {
    try {
      const response = await this.apiClient.get('/v5/market/time');

      if (response.data.retCode === 0) {
        return parseInt(response.data.result.timeSecond) * 1000;
      } else {
        throw new Error(`Failed to get server time: ${response.data.retMsg}`);
      }
    } catch (error) {
      logger.error('Failed to get server time:', error);
      return Date.now();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}