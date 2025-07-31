import { BinanceService } from './binanceService';
import { CMEService } from './cmeService';
import { HyperliquidService } from './hyperliquidService';
import { BybitService } from './bybitService';
import { HedgeRequest, HedgePosition } from '../types';
import { logger } from '../utils/logger';
import { createClient } from 'redis';

export class HedgeService {
  private binanceService: BinanceService;
  private cmeService: CMEService;
  private hyperliquidService: HyperliquidService;
  private bybitService: BybitService;
  private redis: ReturnType<typeof createClient>;
  private isProcessing: boolean = false;

  constructor(
    binanceService: BinanceService,
    cmeService: CMEService,
    hyperliquidService: HyperliquidService,
    bybitService: BybitService,
    redisClient: ReturnType<typeof createClient>
  ) {
    this.binanceService = binanceService;
    this.cmeService = cmeService;
    this.hyperliquidService = hyperliquidService;
    this.bybitService = bybitService;
    this.redis = redisClient;
  }

  async start(): Promise<void> {
    if (this.isProcessing) {
      logger.warn('Hedge service is already running');
      return;
    }

    this.isProcessing = true;
    logger.info('Starting hedge service processor');

    // Start processing hedge requests
    this.processHedgeRequests();
  }

  async stop(): Promise<void> {
    this.isProcessing = false;
    logger.info('Hedge service stopped');
  }

  private async processHedgeRequests(): Promise<void> {
    while (this.isProcessing) {
      try {
        // Get next hedge request from queue
        const requestData = await this.redis.brPop('hedge_requests', 5); // 5 second timeout

        if (requestData) {
          const hedgeRequest: HedgeRequest = JSON.parse(requestData.element);
          await this.executeHedge(hedgeRequest);
        }

      } catch (error) {
        logger.error('Error processing hedge requests:', error);
        // Continue processing even if one request fails
        await this.sleep(1000);
      }
    }
  }

  async executeHedge(request: HedgeRequest): Promise<void> {
    logger.info(`Executing hedge for deposit: ${request.depositTxHash}`);

    try {
      // Check if hedge already exists for this deposit
      const existingHedge = await this.getHedgeByTxHash(request.depositTxHash);
      if (existingHedge.length > 0) {
        logger.warn(`Hedge already exists for deposit: ${request.depositTxHash}`);
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
      const hedgePositions: HedgePosition[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
          hedgePositions.push(result.value);
          const platformName = index === 0 ? 'Binance' : index === 1 ? 'CME' : index === 2 ? 'Hyperliquid' : 'Bybit';
          logger.info(`${platformName} hedge successful`);
        } else {
          const platformName = index === 0 ? 'Binance' : index === 1 ? 'CME' : index === 2 ? 'Hyperliquid' : 'Bybit';
          logger.error(`${platformName} hedge failed:`, result.reason);
        }
      });

      // Store hedge positions
      for (const position of hedgePositions) {
        await this.storeHedgePosition(request.depositTxHash, position);
      }

      // Log hedge execution result
      await this.logHedgeExecution(request, hedgePositions, successCount);

      if (successCount === 0) {
        logger.error(`All hedges failed for deposit: ${request.depositTxHash}`);
        // Could implement retry logic or alerting here
      } else if (successCount === 1) {
        logger.warn(`Partial hedge success for deposit: ${request.depositTxHash}`);
      } else {
        logger.info(`Full hedge success for deposit: ${request.depositTxHash}`);
      }

    } catch (error) {
      logger.error(`Failed to execute hedge for deposit ${request.depositTxHash}:`, error);
    }
  }

  private async executeBinanceHedge(request: HedgeRequest): Promise<HedgePosition> {
    try {
      // Use ETHUSDT for ETH short position
      const position = await this.binanceService.createShortPosition('ETHUSDT', request.ethAmount);

      logger.info(`Binance ETH short position created: ${position.id}`);
      return position;

    } catch (error) {
      logger.error('Binance hedge execution failed:', error);
      throw error;
    }
  }

  private async executeCMEHedge(request: HedgeRequest): Promise<HedgePosition> {
    try {
      // Convert ETH amount to USD value for KRW/USD hedge
      const ethPrice = await this.binanceService.getCurrentPrice('ETHUSDT');
      const usdValue = request.ethAmount * ethPrice;

      const position = await this.cmeService.createKRWUSDShortPosition(usdValue);

      logger.info(`CME KRW/USD short position created: ${position.id}`);
      return position;

    } catch (error) {
      logger.error('CME hedge execution failed:', error);
      throw error;
    }
  }

  private async executeHyperliquidHedge(request: HedgeRequest): Promise<HedgePosition> {
    try {
      // Use ETH for ETH short position on Hyperliquid
      const position = await this.hyperliquidService.createShortPosition('ETH', request.ethAmount);

      logger.info(`Hyperliquid ETH short position created: ${position.id}`);
      return position;

    } catch (error) {
      logger.error('Hyperliquid hedge execution failed:', error);
      throw error;
    }
  }

  private async executeBybitHedge(request: HedgeRequest): Promise<HedgePosition> {
    try {
      // Use ETHUSDT for ETH short position on Bybit
      const position = await this.bybitService.createShortPosition('ETHUSDT', request.ethAmount);

      logger.info(`Bybit ETH short position created: ${position.id}`);
      return position;

    } catch (error) {
      logger.error('Bybit hedge execution failed:', error);
      throw error;
    }
  }

  private async storeHedgePosition(txHash: string, position: HedgePosition): Promise<void> {
    try {
      const key = `hedge:${txHash}:${position.type}`;
      await this.redis.setEx(key, 86400 * 30, JSON.stringify(position)); // Store for 30 days

      // Add to hedge index
      await this.redis.sAdd(`hedge_index:${txHash}`, position.id);

    } catch (error) {
      logger.error('Failed to store hedge position:', error);
    }
  }

  private async logHedgeExecution(
    request: HedgeRequest,
    positions: HedgePosition[],
    successCount: number
  ): Promise<void> {
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

    } catch (error) {
      logger.error('Failed to log hedge execution:', error);
    }
  }

  async getHedgeByTxHash(txHash: string): Promise<HedgePosition[]> {
    try {
      const positionIds = await this.redis.sMembers(`hedge_index:${txHash}`);
      const positions: HedgePosition[] = [];

      for (const positionId of positionIds) {
        const [type] = positionId.split('_');
        const key = `hedge:${txHash}:${type}`;
        const positionData = await this.redis.get(key);

        if (positionData) {
          positions.push(JSON.parse(positionData));
        }
      }

      return positions;
    } catch (error) {
      logger.error('Failed to get hedge by tx hash:', error);
      return [];
    }
  }

  async getHedgeLog(txHash: string): Promise<any> {
    try {
      const logData = await this.redis.get(`hedge_log:${txHash}`);
      return logData ? JSON.parse(logData) : null;
    } catch (error) {
      logger.error('Failed to get hedge log:', error);
      return null;
    }
  }

  async closeHedgePositions(txHash: string): Promise<boolean> {
    try {
      const positions = await this.getHedgeByTxHash(txHash);
      let allClosed = true;

      for (const position of positions) {
        try {
          let success = false;

          if (position.type === 'binance') {
            success = await this.binanceService.closePosition(
              position.id.replace('binance_', ''),
              position.symbol,
              position.amount
            );
          } else if (position.type === 'cme') {
            success = await this.cmeService.closePosition(
              position.id.replace('cme_', ''),
              position.amount
            );
          } else if (position.type === 'hyperliquid') {
            success = await this.hyperliquidService.closePosition(
              position.symbol,
              position.amount
            );
          } else if (position.type === 'bybit') {
            success = await this.bybitService.closePosition(
              position.symbol,
              position.amount
            );
          }

          if (!success) {
            allClosed = false;
            logger.error(`Failed to close ${position.type} position: ${position.id}`);
          } else {
            logger.info(`Closed ${position.type} position: ${position.id}`);
          }

        } catch (error) {
          allClosed = false;
          logger.error(`Error closing position ${position.id}:`, error);
        }
      }

      return allClosed;
    } catch (error) {
      logger.error('Failed to close hedge positions:', error);
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}