import axios, { AxiosInstance } from 'axios';
import { CMEOrderResponse, HedgePosition } from '../types';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export class CMEService {
  private apiClient: AxiosInstance;
  private apiKey: string;
  private secretKey: string;
  private environment: string;

  constructor(apiKey: string, secretKey: string, environment: string = 'production') {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.environment = environment;

    const baseURL = environment === 'production'
      ? 'https://api.cmegroup.com'
      : 'https://api-test.cmegroup.com';

    this.apiClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-CME-API-KEY': apiKey
      }
    });

    this.apiClient.interceptors.request.use((config) => {
      const timestamp = Date.now().toString();
      const method = config.method?.toUpperCase() || 'GET';
      const path = config.url || '';
      const body = config.data ? JSON.stringify(config.data) : '';

      const message = `${timestamp}${method}${path}${body}`;
      const signature = crypto
        .createHmac('sha256', this.secretKey)
        .update(message)
        .digest('hex');

      config.headers['X-CME-TIMESTAMP'] = timestamp;
      config.headers['X-CME-SIGNATURE'] = signature;

      return config;
    });
  }

  async createKRWUSDShortPosition(usdValue: number): Promise<HedgePosition> {
    try {
      logger.info(`Creating KRW/USD short position on CME: $${usdValue}`);

      const krwusdPrice = await this.getCurrentKRWUSDPrice();
      const contractSize = 125000; // Standard KRW futures contract size
      const numberOfContracts = Math.floor(usdValue / (contractSize / krwusdPrice));

      if (numberOfContracts === 0) {
        throw new Error('USD value too small for KRW/USD futures contract');
      }

      const orderPayload = {
        symbol: 'KRW/USD',
        side: 'SELL',
        orderType: 'MARKET',
        quantity: numberOfContracts,
        timeInForce: 'IOC'
      };

      const response = await this.apiClient.post('/v1/orders', orderPayload);
      const orderData = response.data;

      const hedgePosition: HedgePosition = {
        id: `cme_${orderData.orderId}`,
        type: 'cme',
        symbol: 'KRW/USD',
        side: 'short',
        amount: numberOfContracts,
        price: orderData.price || krwusdPrice,
        status: orderData.status === 'FILLED' ? 'open' : 'pending',
        createdAt: new Date(orderData.timestamp || Date.now()),
        updatedAt: new Date(orderData.timestamp || Date.now())
      };

      logger.info(`CME KRW/USD short position created: ${hedgePosition.id}`);
      return hedgePosition;

    } catch (error) {
      logger.error('Failed to create CME KRW/USD short position:', error);

      const fallbackPosition: HedgePosition = {
        id: `cme_fallback_${Date.now()}`,
        type: 'cme',
        symbol: 'KRW/USD',
        side: 'short',
        amount: usdValue,
        price: 0,
        status: 'failed',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      return fallbackPosition;
    }
  }

  async closePosition(orderId: string, quantity: number): Promise<boolean> {
    try {
      logger.info(`Closing CME position: ${orderId}`);

      const orderPayload = {
        originalOrderId: orderId,
        side: 'BUY',
        orderType: 'MARKET',
        quantity: quantity,
        timeInForce: 'IOC'
      };

      const response = await this.apiClient.post('/v1/orders', orderPayload);
      const success = response.data.status === 'FILLED';

      logger.info(`CME position ${success ? 'closed' : 'failed to close'}: ${orderId}`);
      return success;

    } catch (error) {
      logger.error('Failed to close CME position:', error);
      return false;
    }
  }

  async getCurrentKRWUSDPrice(): Promise<number> {
    try {
      const response = await this.apiClient.get('/v1/market-data/KRW-USD');
      return parseFloat(response.data.lastPrice);
    } catch (error) {
      logger.error('Failed to get KRW/USD price from CME:', error);
      return 0.00075; // Fallback approximate rate (1 KRW ≈ 0.00075 USD)
    }
  }

  async getOrderStatus(orderId: string): Promise<any> {
    try {
      const response = await this.apiClient.get(`/v1/orders/${orderId}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get CME order status:', error);
      throw error;
    }
  }

  async getAccountInfo(): Promise<any> {
    try {
      const response = await this.apiClient.get('/v1/account');
      return response.data;
    } catch (error) {
      logger.error('Failed to get CME account info:', error);
      throw error;
    }
  }

  async getPositions(): Promise<any[]> {
    try {
      const response = await this.apiClient.get('/v1/positions');
      return response.data.positions || [];
    } catch (error) {
      logger.error('Failed to get CME positions:', error);
      return [];
    }
  }

  async getMarketData(symbol: string): Promise<any> {
    try {
      const response = await this.apiClient.get(`/v1/market-data/${symbol}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get market data for ${symbol}:`, error);
      throw error;
    }
  }
}