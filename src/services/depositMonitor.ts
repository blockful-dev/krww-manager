import { ethers } from 'ethers';
import { DepositEvent, HedgeRequest } from '../types';
import { logger } from '../utils/logger';
import { createClient } from 'redis';

export class DepositMonitor {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private redis: ReturnType<typeof createClient>;
  private isRunning: boolean = false;
  private lastProcessedBlock: number = 0;

  private readonly DEPOSIT_ABI = [
    'event ETHDeposited(address indexed user, uint256 amount, uint256 krwwMinted)'
  ];

  constructor(
    rpcUrl: string,
    contractAddress: string,
    redisClient: ReturnType<typeof createClient>
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(contractAddress, this.DEPOSIT_ABI, this.provider);
    this.redis = redisClient;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Deposit monitor is already running');
      return;
    }

    try {
      this.isRunning = true;

      // Get the last processed block from Redis
      const lastBlock = await this.redis.get('last_processed_block');
      this.lastProcessedBlock = lastBlock ? parseInt(lastBlock) : await this.provider.getBlockNumber() - 100;

      logger.info(`Starting deposit monitor from block ${this.lastProcessedBlock}`);

      // Set up event listener for new deposits
      this.contract.on('ETHDeposited', this.handleDepositEvent.bind(this));

      // Also periodically check for missed events
      this.startPeriodicCheck();

    } catch (error) {
      logger.error('Failed to start deposit monitor:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.contract.removeAllListeners('ETHDeposited');
    logger.info('Deposit monitor stopped');
  }

  private async handleDepositEvent(
    user: string,
    amount: ethers.BigNumberish,
    krwwMinted: ethers.BigNumberish,
    event: ethers.EventLog
  ): Promise<void> {
    try {
      const depositEvent: DepositEvent = {
        user,
        amount: ethers.formatEther(amount),
        krwwMinted: ethers.formatEther(krwwMinted),
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        timestamp: Date.now()
      };

      logger.info(`New ETH deposit detected: ${depositEvent.amount} ETH from ${user}`);

      // Store the deposit event
      await this.storeDepositEvent(depositEvent);

      // Create hedge request
      const hedgeRequest: HedgeRequest = {
        depositTxHash: depositEvent.transactionHash,
        ethAmount: parseFloat(depositEvent.amount),
        krwwAmount: parseFloat(depositEvent.krwwMinted),
        userAddress: depositEvent.user
      };

      // Queue the hedge request for processing
      await this.queueHedgeRequest(hedgeRequest);

      // Update last processed block
      await this.updateLastProcessedBlock(event.blockNumber);

    } catch (error) {
      logger.error('Failed to handle deposit event:', error);
    }
  }

  private async storeDepositEvent(event: DepositEvent): Promise<void> {
    try {
      const key = `deposit:${event.transactionHash}`;
      await this.redis.setEx(key, 86400 * 7, JSON.stringify(event)); // Store for 7 days

      // Also add to a sorted set for easy querying
      await this.redis.zAdd('deposits:timestamp', {
        score: event.timestamp,
        value: event.transactionHash
      });

    } catch (error) {
      logger.error('Failed to store deposit event:', error);
    }
  }

  private async queueHedgeRequest(request: HedgeRequest): Promise<void> {
    try {
      const queueKey = 'hedge_requests';
      await this.redis.lPush(queueKey, JSON.stringify(request));

      logger.info(`Hedge request queued for tx: ${request.depositTxHash}`);

    } catch (error) {
      logger.error('Failed to queue hedge request:', error);
    }
  }

  private async updateLastProcessedBlock(blockNumber: number): Promise<void> {
    try {
      if (blockNumber > this.lastProcessedBlock) {
        this.lastProcessedBlock = blockNumber;
        await this.redis.set('last_processed_block', blockNumber.toString());
      }
    } catch (error) {
      logger.error('Failed to update last processed block:', error);
    }
  }

  private startPeriodicCheck(): void {
    const checkInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(checkInterval);
        return;
      }

      try {
        await this.checkMissedEvents();
      } catch (error) {
        logger.error('Error during periodic check:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  private async checkMissedEvents(): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = this.lastProcessedBlock + 1;

      if (fromBlock > currentBlock) {
        return; // No new blocks
      }

      logger.debug(`Checking for missed events from block ${fromBlock} to ${currentBlock}`);

      const filter = this.contract.filters.ETHDeposited();
      const events = await this.contract.queryFilter(filter, fromBlock, currentBlock);

      for (const event of events) {
        if (event instanceof ethers.EventLog) {
          await this.handleDepositEvent(
            event.args[0], // user
            event.args[1], // amount
            event.args[2], // krwwMinted
            event
          );
        }
      }

      if (events.length > 0) {
        logger.info(`Processed ${events.length} missed deposit events`);
      }

    } catch (error) {
      logger.error('Failed to check for missed events:', error);
    }
  }

  async getDepositHistory(limit: number = 100): Promise<DepositEvent[]> {
    try {
      const txHashes = await this.redis.zRange('deposits:timestamp', 0, limit - 1, { REV: true });
      const deposits: DepositEvent[] = [];

      for (const txHash of txHashes) {
        const depositData = await this.redis.get(`deposit:${txHash}`);
        if (depositData) {
          deposits.push(JSON.parse(depositData));
        }
      }

      return deposits;
    } catch (error) {
      logger.error('Failed to get deposit history:', error);
      return [];
    }
  }

  async getDepositByTxHash(txHash: string): Promise<DepositEvent | null> {
    try {
      const depositData = await this.redis.get(`deposit:${txHash}`);
      return depositData ? JSON.parse(depositData) : null;
    } catch (error) {
      logger.error('Failed to get deposit by tx hash:', error);
      return null;
    }
  }
}