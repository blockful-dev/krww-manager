"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    ethereum: {
        rpcUrl: process.env.ETH_RPC_URL || '',
        privateKey: process.env.PRIVATE_KEY || '',
        krwwContractAddress: process.env.KRWW_CONTRACT_ADDRESS || '',
        wonderContractAddress: process.env.WONDER_CONTRACT_ADDRESS || '',
        depositContractAddress: process.env.DEPOSIT_CONTRACT_ADDRESS || ''
    },
    binance: {
        apiKey: process.env.BINANCE_API_KEY || '',
        secretKey: process.env.BINANCE_SECRET_KEY || '',
        testnet: process.env.BINANCE_TESTNET === 'true'
    },
    cme: {
        apiKey: process.env.CME_API_KEY || '',
        secretKey: process.env.CME_SECRET_KEY || '',
        environment: process.env.CME_ENVIRONMENT || 'production'
    },
    hyperliquid: {
        privateKey: process.env.HYPERLIQUID_PRIVATE_KEY || '',
        walletAddress: process.env.HYPERLIQUID_WALLET_ADDRESS || '',
        testnet: process.env.HYPERLIQUID_TESTNET === 'true'
    },
    bybit: {
        apiKey: process.env.BYBIT_API_KEY || '',
        secretKey: process.env.BYBIT_SECRET_KEY || '',
        testnet: process.env.BYBIT_TESTNET === 'true'
    },
    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    },
    server: {
        port: parseInt(process.env.PORT || '3000')
    },
    logging: {
        level: process.env.LOG_LEVEL || 'info'
    }
};
function validateConfig() {
    const requiredFields = [
        'ethereum.rpcUrl',
        'ethereum.privateKey',
        'ethereum.depositContractAddress',
        'binance.apiKey',
        'binance.secretKey',
        'hyperliquid.privateKey',
        'hyperliquid.walletAddress',
        'bybit.apiKey',
        'bybit.secretKey'
    ];
    for (const field of requiredFields) {
        const value = field.split('.').reduce((obj, key) => obj?.[key], exports.config);
        if (!value) {
            throw new Error(`Missing required configuration field: ${field}`);
        }
    }
}
exports.validateConfig = validateConfig;
//# sourceMappingURL=index.js.map