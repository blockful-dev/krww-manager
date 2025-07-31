"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepositMonitor = void 0;
const ethers_1 = require("ethers");
const logger_1 = require("../utils/logger");
class DepositMonitor {
    constructor(rpcUrl, contractAddress, redisClient) {
        this.isRunning = false;
        this.lastProcessedBlock = 0;
        this.DEPOSIT_ABI = [
            'event ETHDeposited(address indexed user, uint256 amount, uint256 krwwMinted)'
        ];
        this.provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
        this.contract = new ethers_1.ethers.Contract(contractAddress, this.DEPOSIT_ABI, this.provider);
        this.redis = redisClient;
    }
    async start() {
        if (this.isRunning) {
            logger_1.logger.warn('Deposit monitor is already running');
            return;
        }
        try {
            this.isRunning = true;
            // Get the last processed block from Redis
            const lastBlock = await this.redis.get('last_processed_block');
            this.lastProcessedBlock = lastBlock ? parseInt(lastBlock) : await this.provider.getBlockNumber() - 100;
            logger_1.logger.info(`Starting deposit monitor from block ${this.lastProcessedBlock}`);
            // Set up event listener for new deposits
            this.contract.on('ETHDeposited', this.handleDepositEvent.bind(this));
            // Also periodically check for missed events
            this.startPeriodicCheck();
        }
        catch (error) {
            logger_1.logger.error('Failed to start deposit monitor:', error);
            this.isRunning = false;
            throw error;
        }
    }
    async stop() {
        if (!this.isRunning) {
            return;
        }
        this.isRunning = false;
        this.contract.removeAllListeners('ETHDeposited');
        logger_1.logger.info('Deposit monitor stopped');
    }
    async handleDepositEvent(user, amount, krwwMinted, event) {
        try {
            const depositEvent = {
                user,
                amount: ethers_1.ethers.formatEther(amount),
                krwwMinted: ethers_1.ethers.formatEther(krwwMinted),
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
                timestamp: Date.now()
            };
            logger_1.logger.info(`New ETH deposit detected: ${depositEvent.amount} ETH from ${user}`);
            // Store the deposit event
            await this.storeDepositEvent(depositEvent);
            // Create hedge request
            const hedgeRequest = {
                depositTxHash: depositEvent.transactionHash,
                ethAmount: parseFloat(depositEvent.amount),
                krwwAmount: parseFloat(depositEvent.krwwMinted),
                userAddress: depositEvent.user
            };
            // Queue the hedge request for processing
            await this.queueHedgeRequest(hedgeRequest);
            // Update last processed block
            await this.updateLastProcessedBlock(event.blockNumber);
        }
        catch (error) {
            logger_1.logger.error('Failed to handle deposit event:', error);
        }
    }
    async storeDepositEvent(event) {
        try {
            const key = `deposit:${event.transactionHash}`;
            await this.redis.setEx(key, 86400 * 7, JSON.stringify(event)); // Store for 7 days
            // Also add to a sorted set for easy querying
            await this.redis.zAdd('deposits:timestamp', {
                score: event.timestamp,
                value: event.transactionHash
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to store deposit event:', error);
        }
    }
    async queueHedgeRequest(request) {
        try {
            const queueKey = 'hedge_requests';
            await this.redis.lPush(queueKey, JSON.stringify(request));
            logger_1.logger.info(`Hedge request queued for tx: ${request.depositTxHash}`);
        }
        catch (error) {
            logger_1.logger.error('Failed to queue hedge request:', error);
        }
    }
    async updateLastProcessedBlock(blockNumber) {
        try {
            if (blockNumber > this.lastProcessedBlock) {
                this.lastProcessedBlock = blockNumber;
                await this.redis.set('last_processed_block', blockNumber.toString());
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to update last processed block:', error);
        }
    }
    startPeriodicCheck() {
        const checkInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(checkInterval);
                return;
            }
            try {
                await this.checkMissedEvents();
            }
            catch (error) {
                logger_1.logger.error('Error during periodic check:', error);
            }
        }, 30000); // Check every 30 seconds
    }
    async checkMissedEvents() {
        try {
            const currentBlock = await this.provider.getBlockNumber();
            const fromBlock = this.lastProcessedBlock + 1;
            if (fromBlock > currentBlock) {
                return; // No new blocks
            }
            logger_1.logger.debug(`Checking for missed events from block ${fromBlock} to ${currentBlock}`);
            const filter = this.contract.filters.ETHDeposited();
            const events = await this.contract.queryFilter(filter, fromBlock, currentBlock);
            for (const event of events) {
                if (event instanceof ethers_1.ethers.EventLog) {
                    await this.handleDepositEvent(event.args[0], // user
                    event.args[1], // amount
                    event.args[2], // krwwMinted
                    event);
                }
            }
            if (events.length > 0) {
                logger_1.logger.info(`Processed ${events.length} missed deposit events`);
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to check for missed events:', error);
        }
    }
    async getDepositHistory(limit = 100) {
        try {
            const txHashes = await this.redis.zRange('deposits:timestamp', 0, limit - 1, { REV: true });
            const deposits = [];
            for (const txHash of txHashes) {
                const depositData = await this.redis.get(`deposit:${txHash}`);
                if (depositData) {
                    deposits.push(JSON.parse(depositData));
                }
            }
            return deposits;
        }
        catch (error) {
            logger_1.logger.error('Failed to get deposit history:', error);
            return [];
        }
    }
    async getDepositByTxHash(txHash) {
        try {
            const depositData = await this.redis.get(`deposit:${txHash}`);
            return depositData ? JSON.parse(depositData) : null;
        }
        catch (error) {
            logger_1.logger.error('Failed to get deposit by tx hash:', error);
            return null;
        }
    }
}
exports.DepositMonitor = DepositMonitor;
//# sourceMappingURL=depositMonitor.js.map