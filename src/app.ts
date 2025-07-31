import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { BinanceService } from './services/binanceService';
import { CMEService } from './services/cmeService';
import { HyperliquidService } from './services/hyperliquidService';
import { BybitService } from './services/bybitService';
import { DepositMonitor } from './services/depositMonitor';
import { HedgeService } from './services/hedgeService';
import { RedisManager } from './utils/redis';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';

export class KRWWManagerApp {
  private app: express.Application;
  private redisManager!: RedisManager;
  private binanceService!: BinanceService;
  private cmeService!: CMEService;
  private hyperliquidService!: HyperliquidService;
  private bybitService!: BybitService;
  private depositMonitor!: DepositMonitor;
  private hedgeService!: HedgeService;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.initializeServices();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  private initializeServices(): void {
    this.redisManager = RedisManager.getInstance();

    this.binanceService = new BinanceService(
      config.binance.apiKey,
      config.binance.secretKey,
      config.binance.testnet
    );

    this.cmeService = new CMEService(
      config.cme.apiKey,
      config.cme.secretKey,
      config.cme.environment
    );

    this.hyperliquidService = new HyperliquidService(
      config.hyperliquid.privateKey,
      config.hyperliquid.walletAddress,
      config.hyperliquid.testnet
    );

    this.bybitService = new BybitService(
      config.bybit.apiKey,
      config.bybit.secretKey,
      config.bybit.testnet
    );

    this.depositMonitor = new DepositMonitor(
      config.ethereum.rpcUrl,
      config.ethereum.depositContractAddress,
      this.redisManager.getClient()
    );

    this.hedgeService = new HedgeService(
      this.binanceService,
      this.cmeService,
      this.hyperliquidService,
      this.bybitService,
      this.redisManager.getClient()
    );
  }

  private setupRoutes(): void {
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
      } catch (error) {
        res.status(500).json({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get deposit history
    this.app.get('/api/deposits', async (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 100;
        const deposits = await this.depositMonitor.getDepositHistory(limit);
        res.json({ deposits });
      } catch (error) {
        logger.error('Failed to get deposit history:', error);
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
      } catch (error) {
        logger.error('Failed to get deposit:', error);
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
      } catch (error) {
        logger.error('Failed to get hedge positions:', error);
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
      } catch (error) {
        logger.error('Failed to close hedge positions:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get Binance account info
    this.app.get('/api/binance/account', async (req, res) => {
      try {
        const balance = await this.binanceService.getAccountBalance();
        res.json({ balance });
      } catch (error) {
        logger.error('Failed to get Binance account info:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get CME account info
    this.app.get('/api/cme/account', async (req, res) => {
      try {
        const accountInfo = await this.cmeService.getAccountInfo();
        res.json({ accountInfo });
      } catch (error) {
        logger.error('Failed to get CME account info:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get Hyperliquid account info
    this.app.get('/api/hyperliquid/account', async (req, res) => {
      try {
        const accountInfo = await this.hyperliquidService.getAccountInfo();
        res.json({ accountInfo });
      } catch (error) {
        logger.error('Failed to get Hyperliquid account info:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get Hyperliquid positions
    this.app.get('/api/hyperliquid/positions', async (req, res) => {
      try {
        const positions = await this.hyperliquidService.getPositions();
        res.json({ positions });
      } catch (error) {
        logger.error('Failed to get Hyperliquid positions:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get Bybit account info
    this.app.get('/api/bybit/account', async (req, res) => {
      try {
        const accountInfo = await this.bybitService.getAccountInfo();
        res.json({ accountInfo });
      } catch (error) {
        logger.error('Failed to get Bybit account info:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get Bybit positions
    this.app.get('/api/bybit/positions', async (req, res) => {
      try {
        const positions = await this.bybitService.getPositions();
        res.json({ positions });
      } catch (error) {
        logger.error('Failed to get Bybit positions:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });

    // Global error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  public async start(): Promise<void> {
    try {
      validateConfig();

      // Connect to Redis
      await this.redisManager.connect();

      // Start services
      await this.depositMonitor.start();
      await this.hedgeService.start();

      // Start HTTP server
      const port = config.server.port;
      this.app.listen(port, () => {
        logger.info(`KRWW Manager server started on port ${port}`);
      });

    } catch (error) {
      logger.error('Failed to start application:', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.depositMonitor.stop();
      await this.hedgeService.stop();
      await this.redisManager.disconnect();

      logger.info('KRWW Manager application stopped');
    } catch (error) {
      logger.error('Error stopping application:', error);
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}