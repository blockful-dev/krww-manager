# KRWW Manager

## Overview

This system monitors ETH deposits on a smart contract and automatically:
1. Mints KRWW tokens to depositors
2. Opens short positions on Binance (ETH/USDT)
3. Opens short positions on Hyperliquid (ETH)
4. Opens short positions on Bybit (ETH/USDT)
5. Opens short positions on CME (KRW/USD futures)

## Architecture

```
ETH Deposit → Deposit Monitor → Hedge Service → [Binance + Hyperliquid + Bybit + CME]
     ↓              ↓               ↓
KRWW Minted    Queue Request   Short Positions
```

## Key Components

- **DepositMonitor**: Service monitoring blockchain for deposit events
- **HedgeService**: Orchestrates quadruple hedging strategy
- **BinanceService**: Integration with Binance API for ETH shorts
- **HyperliquidService**: Integration with Hyperliquid API for ETH shorts
- **BybitService**: Integration with Bybit API for ETH shorts
- **CMEService**: Integration with CME API for KRW/USD futures

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

3. Start Redis:
```bash
redis-server
```

4. Build and run:
```bash
npm run build
npm start
```

For development:
```bash
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ETH_RPC_URL` | Ethereum RPC endpoint |
| `PRIVATE_KEY` | Private key for blockchain interactions |
| `DEPOSIT_CONTRACT_ADDRESS` | Address of the DepositManager contract |
| `KRWW_CONTRACT_ADDRESS` | Address of the KRWW token contract |
| `WONDER_CONTRACT_ADDRESS` | Address of the WONDER token contract |
| `BINANCE_API_KEY` | Binance API key |
| `BINANCE_SECRET_KEY` | Binance secret key |
| `HYPERLIQUID_PRIVATE_KEY` | Hyperliquid wallet private key |
| `HYPERLIQUID_WALLET_ADDRESS` | Hyperliquid wallet address |
| `BYBIT_API_KEY` | Bybit API key |
| `BYBIT_SECRET_KEY` | Bybit secret key |
| `CME_API_KEY` | CME API key |
| `CME_SECRET_KEY` | CME secret key |
| `REDIS_URL` | Redis connection URL |

## API Endpoints

- `GET /health` - Health check
- `GET /api/deposits` - Get deposit history
- `GET /api/deposits/:txHash` - Get specific deposit
- `GET /api/hedges/:txHash` - Get hedge positions for deposit
- `POST /api/hedges/:txHash/close` - Close hedge positions
- `GET /api/binance/account` - Binance account info
- `GET /api/hyperliquid/account` - Hyperliquid account info
- `GET /api/hyperliquid/positions` - Hyperliquid positions
- `GET /api/bybit/account` - Bybit account info
- `GET /api/bybit/positions` - Bybit positions
- `GET /api/cme/account` - CME account info

## Smart Contracts

Deploy the contracts in this order:
1. Deploy KRWW token contract
2. Deploy DepositManager contract with KRWW and WONDER addresses
3. Add DepositManager as a minter for KRWW token

## Risk Management

- The system maintains delta-neutral positions by shorting equivalent values
- ETH exposure is hedged via Binance ETH/USDT shorts
- Currency exposure (KRW/USD) is hedged via CME futures
- All positions are tracked and can be manually closed if needed

## Security Considerations

- Private keys should be stored securely (consider using AWS KMS or similar)
- API keys should have minimal required permissions
- Monitor hedge ratios and adjust as needed
- Implement proper access controls for admin functions

## Monitoring

- Check logs in `logs/` directory
- Monitor Redis for queue health
- Track hedge execution success rates
- Monitor contract events for missed deposits