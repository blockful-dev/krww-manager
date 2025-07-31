import { BinanceService } from './binanceService';
import { CMEService } from './cmeService';
import { HyperliquidService } from './hyperliquidService';
import { BybitService } from './bybitService';
import { HedgeRequest, HedgePosition } from '../types';
import { createClient } from 'redis';
export declare class HedgeService {
    private binanceService;
    private cmeService;
    private hyperliquidService;
    private bybitService;
    private redis;
    private isProcessing;
    constructor(binanceService: BinanceService, cmeService: CMEService, hyperliquidService: HyperliquidService, bybitService: BybitService, redisClient: ReturnType<typeof createClient>);
    start(): Promise<void>;
    stop(): Promise<void>;
    private processHedgeRequests;
    executeHedge(request: HedgeRequest): Promise<void>;
    private executeBinanceHedge;
    private executeCMEHedge;
    private executeHyperliquidHedge;
    private executeBybitHedge;
    private storeHedgePosition;
    private logHedgeExecution;
    getHedgeByTxHash(txHash: string): Promise<HedgePosition[]>;
    getHedgeLog(txHash: string): Promise<any>;
    closeHedgePositions(txHash: string): Promise<boolean>;
    private sleep;
}
//# sourceMappingURL=hedgeService.d.ts.map