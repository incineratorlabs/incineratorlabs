# Incinerator Labs

Automated buy-and-burn protocol for decentralized ecosystems. Incinerator Labs leverages algorithmic trading and tokenomics to systematically purchase and burn tokens, reducing supply and enhancing token value.

## 🚀 Features
- Automated buy and burn every specified interval.
- Configurable burn ratios and buy intervals.
- Dynamic supply control.
- Solana blockchain integration.
- Wallet balance monitoring to optimize the burn cycle.

## 📦 Installation
1. Clone the repository:

```bash
git clone https://github.com/yourusername/incineratorlabs.git
```

2. Navigate to the project directory:

```bash
cd incineratorlabs
```

3. Install dependencies:

```bash
npm install
```

## ⚡ Usage
1. Configure environment variables in `.env`:

```
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PRIVATE_KEY=your_private_key_here
TARGET_TOKEN_MINT=your_token_mint_address
BURN_RATIO=0.01
INTERVAL=30m
```

2. Install **PM2** globally to run the bot in the background:

```bash
npm install -g pm2
```

3. Start the bot using PM2:

```bash
pm2 start burn.js --name incineratorlabs
```

4. View logs:

```bash
pm2 logs incineratorlabs
```

5. Stop the bot:

```bash
pm2 stop incineratorlabs
```

6. Restart the bot:

```bash
pm2 restart incineratorlabs
```

## 🔧 Configuration
- **SOLANA_RPC_URL**: Solana RPC URL, e.g., `https://api.mainnet-beta.solana.com`
- **PRIVATE_KEY**: The private key of the wallet executing the buy and burn (JSON Array format).
- **TARGET_TOKEN_MINT**: The token mint address of the target token.
- **BURN_RATIO**: Minimum SOL to leave in the wallet after purchasing tokens.
- **INTERVAL**: Time interval for each buy and burn cycle (e.g., `30m`, `1h`).

## 🛠️ Tech Stack
- Node.js
- Solana Web3.js
- Axios
- PM2

## 🤝 Contributing
- Fork the repository
- Create a feature branch (`git checkout -b feature/YourFeature`)
- Commit your changes (`git commit -m 'Add some feature'`)
- Push to the branch (`git push origin feature/YourFeature`)
- Open a pull request

## 📄 License
This project is licensed under the MIT License.
