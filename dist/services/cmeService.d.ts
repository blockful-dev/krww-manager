import { HedgePosition } from '../types';
export declare class CMEService {
    private apiClient;
    private apiKey;
    private secretKey;
    private environment;
    constructor(apiKey: string, secretKey: string, environment?: string);
    createKRWUSDShortPosition(usdValue: number): Promise<HedgePosition>;
    closePosition(orderId: string, quantity: number): Promise<boolean>;
    getCurrentKRWUSDPrice(): Promise<number>;
    getOrderStatus(orderId: string): Promise<any>;
    getAccountInfo(): Promise<any>;
    getPositions(): Promise<any[]>;
    getMarketData(symbol: string): Promise<any>;
}
//# sourceMappingURL=cmeService.d.ts.map