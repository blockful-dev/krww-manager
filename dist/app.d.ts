import express from 'express';
export declare class KRWWManagerApp {
    private app;
    private redisManager;
    private binanceService;
    private cmeService;
    private hyperliquidService;
    private bybitService;
    private depositMonitor;
    private hedgeService;
    constructor();
    private setupMiddleware;
    private initializeServices;
    private setupRoutes;
    private setupErrorHandling;
    start(): Promise<void>;
    stop(): Promise<void>;
    getApp(): express.Application;
}
//# sourceMappingURL=app.d.ts.map