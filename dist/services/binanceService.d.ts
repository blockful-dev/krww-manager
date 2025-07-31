import { HedgePosition } from '../types';
export declare class BinanceService {
    private client;
    private isTestnet;
    constructor(apiKey: string, secretKey: string, testnet?: boolean);
    createShortPosition(symbol: string, ethAmount: number): Promise<HedgePosition>;
    closePosition(orderId: string, symbol: string, quantity: number): Promise<boolean>;
    getAccountBalance(): Promise<any>;
    getOrderStatus(symbol: string, orderId: number): Promise<any>;
    getExchangeInfo(): Promise<any>;
    getCurrentPrice(symbol: string): Promise<number>;
}
//# sourceMappingURL=binanceService.d.ts.map