import { HedgePosition } from '../types';
export declare class HyperliquidService {
    private apiClient;
    private privateKey;
    private walletAddress;
    private isTestnet;
    constructor(privateKey: string, walletAddress: string, testnet?: boolean);
    createShortPosition(coin: string, ethAmount: number): Promise<HedgePosition>;
    closePosition(coin: string, positionSize: number): Promise<boolean>;
    getMarketData(coin: string): Promise<any>;
    getAccountInfo(): Promise<any>;
    getPositions(): Promise<any[]>;
    getOrderHistory(coin?: string): Promise<any[]>;
    private signAction;
    private signMessage;
    getCurrentPrice(coin: string): Promise<number>;
    cancelAllOrders(coin?: string): Promise<boolean>;
}
//# sourceMappingURL=hyperliquidService.d.ts.map