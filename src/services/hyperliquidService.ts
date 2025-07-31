import axios, { AxiosInstance } from 'axios';
import { HedgePosition } from '../types';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface HyperliquidOrderRequest {
  coin: string;
  is_buy: boolean;
  sz: number;
  limit_px: number;
  order_type: {
    limit?: {
      tif: 'Gtc' | 'Ioc' | 'Alo';
    };
    trigger?: {
      trigger_px: number;
      is_market: boolean;
      tpsl: 'tp' | 'sl';
    };
  };
  reduce_only: boolean;
}

interface HyperliquidSignedAction {
  action: any;
  nonce: number;
  signature: {
    r: string;
    s: string;
    v: number;
  };
}

export class HyperliquidService {
  private apiClient: AxiosInstance;
  private privateKey: string;
  private walletAddress: string;
  private isTestnet: boolean;

  constructor(privateKey: string, walletAddress: string, testnet: boolean = false) {
    this.privateKey = privateKey;
    this.walletAddress = walletAddress;
    this.isTestnet = testnet;

    const baseURL = testnet
      ? 'https://api.hyperliquid-testnet.xyz'
      : 'https://api.hyperliquid.xyz';

    this.apiClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async createShortPosition(coin: string, ethAmount: number): Promise<HedgePosition> {
    try {
      logger.info(`Creating short position on Hyperliquid: ${coin}, amount: ${ethAmount} ETH`);

      // Get current market price
      const marketData = await this.getMarketData(coin);
      const currentPrice = parseFloat(marketData.markPx);

      // Calculate position size (using market order for immediate execution)
      const positionSize = ethAmount;

      const orderRequest: HyperliquidOrderRequest = {
        coin: coin,
        is_buy: false, // Short position
        sz: positionSize,
        limit_px: currentPrice * 0.995, // Slightly below market for better fill
        order_type: {
          limit: {
            tif: 'Ioc' // Immediate or Cancel
          }
        },
        reduce_only: false
      };

      // Sign and submit the order
      const signedAction = await this.signAction({
        type: 'order',
        orders: [orderRequest],
        grouping: 'na'
      });

      const response = await this.apiClient.post('/exchange', signedAction);
      const orderResult = response.data;

      if (orderResult.status === 'ok' && orderResult.response?.data?.statuses) {
        const orderStatus = orderResult.response.data.statuses[0];

        const hedgePosition: HedgePosition = {
          id: `hyperliquid_${orderStatus.resting?.oid || Date.now()}`,
          type: 'hyperliquid',
          symbol: coin,
          side: 'short',
          amount: positionSize,
          price: currentPrice,
          status: orderStatus.filled ? 'open' : 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        logger.info(`Hyperliquid short position created: ${hedgePosition.id}`);
        return hedgePosition;
      } else {
        throw new Error(`Order failed: ${JSON.stringify(orderResult)}`);
      }

    } catch (error) {
      logger.error('Failed to create Hyperliquid short position:', error);

      // Return failed position for tracking
      const failedPosition: HedgePosition = {
        id: `hyperliquid_failed_${Date.now()}`,
        type: 'hyperliquid',
        symbol: coin,
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

  async closePosition(coin: string, positionSize: number): Promise<boolean> {
    try {
      logger.info(`Closing Hyperliquid position: ${coin}, size: ${positionSize}`);

      const marketData = await this.getMarketData(coin);
      const currentPrice = parseFloat(marketData.markPx);

      const closeOrderRequest: HyperliquidOrderRequest = {
        coin: coin,
        is_buy: true, // Buy to close short
        sz: positionSize,
        limit_px: currentPrice * 1.005, // Slightly above market for better fill
        order_type: {
          limit: {
            tif: 'Ioc'
          }
        },
        reduce_only: true // This ensures we're closing existing position
      };

      const signedAction = await this.signAction({
        type: 'order',
        orders: [closeOrderRequest],
        grouping: 'na'
      });

      const response = await this.apiClient.post('/exchange', signedAction);
      const orderResult = response.data;

      const success = orderResult.status === 'ok' &&
                     orderResult.response?.data?.statuses?.[0]?.filled;

      logger.info(`Hyperliquid position ${success ? 'closed' : 'failed to close'}`);
      return success;

    } catch (error) {
      logger.error('Failed to close Hyperliquid position:', error);
      return false;
    }
  }

  async getMarketData(coin: string): Promise<any> {
    try {
      const response = await this.apiClient.post('/info', {
        type: 'l2Book',
        coin: coin
      });

      if (response.data && response.data.levels) {
        // Calculate mark price from order book
        const bids = response.data.levels[0] || [];
        const asks = response.data.levels[1] || [];

        if (bids.length > 0 && asks.length > 0) {
          const bestBid = parseFloat(bids[0][0]);
          const bestAsk = parseFloat(asks[0][0]);
          const markPx = (bestBid + bestAsk) / 2;

          return {
            coin,
            markPx: markPx.toString(),
            bestBid: bestBid.toString(),
            bestAsk: bestAsk.toString()
          };
        }
      }

      throw new Error(`No market data available for ${coin}`);
    } catch (error) {
      logger.error(`Failed to get market data for ${coin}:`, error);
      throw error;
    }
  }

  async getAccountInfo(): Promise<any> {
    try {
      const response = await this.apiClient.post('/info', {
        type: 'clearinghouseState',
        user: this.walletAddress
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to get Hyperliquid account info:', error);
      throw error;
    }
  }

  async getPositions(): Promise<any[]> {
    try {
      const response = await this.apiClient.post('/info', {
        type: 'clearinghouseState',
        user: this.walletAddress
      });

      return response.data?.assetPositions || [];
    } catch (error) {
      logger.error('Failed to get Hyperliquid positions:', error);
      return [];
    }
  }

  async getOrderHistory(coin?: string): Promise<any[]> {
    try {
      const response = await this.apiClient.post('/info', {
        type: 'userFills',
        user: this.walletAddress,
        ...(coin && { coin })
      });

      return response.data || [];
    } catch (error) {
      logger.error('Failed to get Hyperliquid order history:', error);
      return [];
    }
  }

  private async signAction(action: any): Promise<HyperliquidSignedAction> {
    try {
      // This is a simplified signing process
      // In production, you'd need to implement proper EIP-712 signing
      const nonce = Date.now();

      // Create message hash (simplified)
      const message = JSON.stringify({ action, nonce });
      const messageHash = crypto.createHash('sha256').update(message).digest();

      // Sign with private key (this is simplified - use proper secp256k1 signing)
      const signature = this.signMessage(messageHash);

      return {
        action,
        nonce,
        signature: {
          r: signature.r,
          s: signature.s,
          v: signature.v
        }
      };
    } catch (error) {
      logger.error('Failed to sign action:', error);
      throw error;
    }
  }

  private signMessage(messageHash: Buffer): { r: string; s: string; v: number } {
    // This is a placeholder for proper ECDSA signing
    // You should use a proper crypto library like @noble/secp256k1 or ethers
    const dummySignature = {
      r: '0x' + crypto.randomBytes(32).toString('hex'),
      s: '0x' + crypto.randomBytes(32).toString('hex'),
      v: 27
    };

    logger.warn('Using dummy signature - implement proper ECDSA signing for production');
    return dummySignature;
  }

  async getCurrentPrice(coin: string): Promise<number> {
    try {
      const marketData = await this.getMarketData(coin);
      return parseFloat(marketData.markPx);
    } catch (error) {
      logger.error(`Failed to get current price for ${coin}:`, error);
      throw error;
    }
  }

  async cancelAllOrders(coin?: string): Promise<boolean> {
    try {
      const signedAction = await this.signAction({
        type: 'cancelByCloid',
        cancels: [{
          coin: coin || null,
          cloid: null // Cancel all orders
        }]
      });

      const response = await this.apiClient.post('/exchange', signedAction);
      return response.data.status === 'ok';
    } catch (error) {
      logger.error('Failed to cancel orders:', error);
      return false;
    }
  }
}