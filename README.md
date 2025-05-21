<div align="center">
  <img src="https://incineratorlabs.xyz/128x.png" alt="Incinerator Labs Logo" />
</div>
<br>
<p align="center">
  <a href="https://incineratorlabs.xyz/">
    <img src="https://img.shields.io/badge/website-incineratorlabs.xyz-blue?style=flat-square" alt="Website" />
  </a>
  <a href="https://x.com/incineratorlabs">
    <img src="https://img.shields.io/badge/x-@incineratorlabs-black?style=flat-square&logo=twitter" alt="X / Twitter" />
  </a>
</p>



# Incinerator Labs

Automated buy-and-burn protocol for decentralized ecosystems. Incinerator Labs leverages algorithmic trading and tokenomics to systematically purchase and burn tokens, reducing supply and enhancing token value.

## 🚀 Features
- Automated buy and burn at specified intervals.
- Optional Pump.fun creator reward claiming.
- Configurable burn ratios and buy intervals.
- Dynamic supply control and token burning.
- Solana blockchain integration with SPL token support.
- Wallet balance monitoring to optimize burn cycles.

---

## 📦 Installation

1. **Clone the repository:**

```bash
git clone https://github.com/yourusername/incineratorlabs.git
```

2. **Navigate to the project directory:**

```bash
cd incineratorlabs
```

3. **Install dependencies:**

```bash
npm install @solana/spl-token @solana/web3.js cross-fetch bs58
```

4. **Install additional global dependencies:**

```bash
npm install @solana/spl-token @solana/web3.js cross-fetch bs58 -g pm2
```

---

## ⚡ Usage

1. **Configure environment variables in `.env`:**

```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PRIVATE_KEY=your_base58_private_key_here
TARGET_TOKEN_MINT=your_token_mint_address
BURN_RATIO=0.01
INTERVAL=30m
PUMPSWAP_REWARD=true
```

2. **Start the bot using PM2:**

```bash
pm2 start bot.js --name incineratorlabs
```

3. **View logs:**

```bash
pm2 logs incineratorlabs
```

4. **Stop the bot:**

```bash
pm2 stop incineratorlabs
```

5. **Restart the bot:**

```bash
pm2 restart incineratorlabs
```

---

## 🔧 Configuration

| Variable           | Description                                                  | Example                                    |
|--------------------|--------------------------------------------------------------|--------------------------------------------|
| `SOLANA_RPC_URL`   | Solana RPC URL (Mainnet or Devnet)                          | `https://api.mainnet-beta.solana.com`     |
| `PRIVATE_KEY`      | Base58 encoded private key of the wallet                    | `your_base58_key_here`                     |
| `TARGET_TOKEN_MINT`| Token mint address to target for buying and burning        | `your_token_mint_address`                  |
| `BURN_RATIO`       | Minimum SOL to keep in the wallet after each cycle         | `0.01`                                     |
| `INTERVAL`         | Time interval for each buy and burn cycle                  | `10m`, `30m`                                 |
| `PUMPSWAP_REWARD`  | Set to `true` to claim Pump.fun creator reward before burn | `true` or `false`                          |

---

## 🛠️ Tech Stack
- Node.js - Backend runtime
- Solana Web3.js - Solana blockchain interaction
- SPL Token - Token operations
- Axios - HTTP requests
- PM2 - Process management

---

## 💡 How It Works
- The bot checks the SOL balance at each interval and calculates the amount available for swapping.
- If enabled, it first claims any Pump.fun creator rewards.
- Executes a swap, exchanging SOL for the target token.
- Burns the acquired tokens immediately after the swap.
- Monitors and adjusts the burn amount based on available token balance to avoid over-burning.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch:

```bash
git checkout -b feature/YourFeature
```

3. Commit your changes:

```bash
git commit -m "Add new feature"
```

4. Push to the branch:

```bash
git push origin feature/YourFeature
```

5. Open a pull request

---

## 🛡️ Security
- Keep your `.env` file secure and **never expose your private key**.
- Use a dedicated wallet for testing on Devnet before deploying on Mainnet.
- Regularly monitor and update dependencies to mitigate security risks.

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for more details.
