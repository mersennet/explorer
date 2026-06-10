# Mersennet Explorer — Block Explorer

Block explorer for Mersennet (Chain ID 7919). Vanilla JavaScript SPA with no build step.

**Live:** http://46.225.30.187/

## Features

- Dashboard with live-updating blocks and transactions
- Block detail with gas usage, transaction list, timestamps
- Transaction detail with decoded method calls, receipt, logs
- Address page with balance, transaction history, contract detection
- Validator list with stake distribution
- Network info page with endpoints, contracts, tokenomics
- MetaMask "Add Network" button
- Full search (blocks, transactions, addresses)
- Responsive design with dark theme (Violet/Pink/Cyan brand)

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page shell, nav, footer |
| `style.css` | Full CSS with design tokens, responsive breakpoints |
| `app.js` | SPA router, RPC client, all page renderers |

## Configuration

Edit the top of `app.js`:

```javascript
var RPC_URL = 'http://46.225.30.187:8545';
var CHAIN_ID = 7919;
var BLOCK_TIME_SECS = 1;
```

## Deploy

```bash
scp index.html style.css app.js root@46.225.30.187:/var/www/explorer/
```

## Development

Open `index.html` directly in a browser. No build step required. The app connects to the RPC URL configured in `app.js`.
