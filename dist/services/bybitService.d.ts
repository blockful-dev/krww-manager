import { HedgePosition } from '../types';
export declare class BybitService {
    private apiClient;
    private apiKey;
    private secretKey;
    private isTestnet;
    constructor(apiKey: string, secretKey: string, testnet?: boolean);
    createShortPosition(symbol: string, ethAmount: number): Promise<HedgePosition>;
    closePosition(symbol: string, positionSize: number, orderId?: string): Promise<boolean>;
    getTicker(symbol: string): Promise<any>;
    getInstrumentInfo(symbol: string): Promise<any>;
    getOrderStatus(symbol: string, orderId: string): Promise<any>;
    getAccountInfo(): Promise<any>;
    getPositions(symbol?: string): Promise<any[]>;
    getOrderHistory(symbol?: string, limit?: number): Promise<any[]>;
    getCurrentPrice(symbol: string): Promise<number>;
    cancelAllOrders(symbol?: string): Promise<boolean>;
    getServerTime(): Promise<number>;
    private sleep;
}
//# sourceMappingURL=bybitService.d.ts.map