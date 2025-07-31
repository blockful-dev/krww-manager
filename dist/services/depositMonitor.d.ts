import { DepositEvent } from '../types';
import { createClient } from 'redis';
export declare class DepositMonitor {
    private provider;
    private contract;
    private redis;
    private isRunning;
    private lastProcessedBlock;
    private readonly DEPOSIT_ABI;
    constructor(rpcUrl: string, contractAddress: string, redisClient: ReturnType<typeof createClient>);
    start(): Promise<void>;
    stop(): Promise<void>;
    private handleDepositEvent;
    private storeDepositEvent;
    private queueHedgeRequest;
    private updateLastProcessedBlock;
    private startPeriodicCheck;
    private checkMissedEvents;
    getDepositHistory(limit?: number): Promise<DepositEvent[]>;
    getDepositByTxHash(txHash: string): Promise<DepositEvent | null>;
}
//# sourceMappingURL=depositMonitor.d.ts.map