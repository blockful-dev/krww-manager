export interface DepositEvent {
  user: string;
  amount: string;
  krwwMinted: string;
  blockNumber: number;
  transactionHash: string;
  timestamp: number;
}

export interface HedgePosition {
  id: string;
  type: 'binance' | 'cme' | 'hyperliquid' | 'bybit';
  symbol: string;
  side: 'short' | 'long';
  amount: number;
  price: number;
  status: 'pending' | 'open' | 'closed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  fills: Array<{
    price: string;
    qty: string;
    commission: string;
    commissionAsset: string;
  }>;
}

export interface CMEOrderResponse {
  orderId: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  timestamp: number;
}

export interface HyperliquidOrderResponse {
  status: string;
  response?: {
    data?: {
      statuses?: Array<{
        resting?: {
          oid: number;
        };
        filled?: {
          totalSz: string;
          avgPx: string;
        };
      }>;
    };
  };
}

export interface BybitOrderResponse {
  retCode: number;
  retMsg: string;
  result: {
    orderId: string;
    orderLinkId: string;
  };
  retExtInfo: any;
  time: number;
}

export interface Config {
  ethereum: {
    rpcUrl: string;
    privateKey: string;
    krwwContractAddress: string;
    wonderContractAddress: string;
    depositContractAddress: string;
  };
  binance: {
    apiKey: string;
    secretKey: string;
    testnet: boolean;
  };
  cme: {
    apiKey: string;
    secretKey: string;
    environment: string;
  };
  hyperliquid: {
    privateKey: string;
    walletAddress: string;
    testnet: boolean;
  };
  bybit: {
    apiKey: string;
    secretKey: string;
    testnet: boolean;
  };
  redis: {
    url: string;
  };
  server: {
    port: number;
  };
  logging: {
    level: string;
  };
}

export interface HedgeRequest {
  depositTxHash: string;
  ethAmount: number;
  krwwAmount: number;
  userAddress: string;
}