// Combined Buy, Claim, and Burn Script for IncineratorLabs (Jupiter Swap Integrated)

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  VersionedTransaction
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createBurnInstruction,
  getMint,
  getAccount
} = require('@solana/spl-token');
const schedule = require('node-schedule');
const bs58 = require('bs58');
const axios = require('axios');
require('dotenv').config();

const WebSocket = require('ws');

let ws;
function initWebSocket() {
  ws = new WebSocket('wss://burn.incineratorlabs.xyz');

  ws.on('close', () => {
    console.log('[log stream] disconnected, retrying...');
    setTimeout(initWebSocket, 3000);
  });

  ws.on('error', (err) => {
    console.error('[log stream error]', err.message);
  });
}

const originalLog = console.log;
console.log = (...args) => {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  originalLog(msg);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(msg);
  }
};

initWebSocket();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TARGET_TOKEN_MINT = process.env.TARGET_TOKEN_MINT;
const INTERVAL = process.env.INTERVAL || '30m';
const BURN_RATIO = parseFloat(process.env.BURN_RATIO) || 0.01;
const MIN_BALANCE_SOL = BURN_RATIO * 1e9;
const PUMPSWAP_REWARD = process.env.PUMPSWAP_REWARD === 'true';

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const fallbackConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const privateKeyArray = bs58.decode(PRIVATE_KEY);
const wallet = Keypair.fromSecretKey(privateKeyArray);

console.log('Wallet Public Key:', wallet.publicKey.toBase58());

let cachedBlockhash = null;
let cachedBalance = null;

async function safeRpcCall(fn, fallbackFn, delay = 500, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('429')) {
        console.log(`429 rate limit hit, retrying in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
      } else {
        break;
      }
    }
  }
  console.warn('Switching to fallback RPC...');
  return await fallbackFn();
}

async function getTokenAccountBalanceWithRetry(tokenAccount, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      const accountInfo = await getAccount(connection, tokenAccount);
      return accountInfo.amount;
    } catch (e) {
      console.log(`Token account not found, retrying (${i + 1}/${retries})...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  console.warn(`Token account ${tokenAccount.toBase58()} not found after retries. Trying fallback connection...`);
  try {
    const accountInfo = await getAccount(fallbackConnection, tokenAccount);
    return accountInfo.amount;
  } catch (e) {
    console.warn(`Fallback also failed. Skipping burn.`);
    return BigInt(0);
  }
}

async function claimPumpFunCreatorFee() {
  console.log('Claiming Pump.fun Creator Fee...');
  const programId = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  const instructionData = Buffer.from("1416567bc61cdb84", "hex");
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: new PublicKey("9PRQYGFwcGhaMBx3KiPy62MSzaFyETDZ5U8Qr2HAavTX"), isSigner: false, isWritable: true },
    { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
    { pubkey: new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"), isSigner: false, isWritable: false },
    { pubkey: programId, isSigner: false, isWritable: false },
  ];

  if (!cachedBlockhash) {
    cachedBlockhash = (await safeRpcCall(() => connection.getLatestBlockhash(), () => fallbackConnection.getLatestBlockhash())).blockhash;
  }

  const instruction = new TransactionInstruction({ keys, programId, data: instructionData });
  const tx = new Transaction({
    recentBlockhash: cachedBlockhash,
    feePayer: wallet.publicKey,
  }).add(instruction);

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
    console.log("Claim transaction sent:", sig);
  } catch (error) {
    console.error("Claim transaction failed:", error.message);
  }
}

async function executeJupiterSwap(inputMint, outputMint, amountLamports) {
  try {
    const inAmount = amountLamports.toString();

    console.log(`Swapping via Jupiter: ${inputMint.toBase58()} → ${outputMint.toBase58()} using ${Number(amountLamports) / 1e9} SOL`);

    const quoteResponse = await axios.get('https://quote-api.jup.ag/v6/quote', {
      params: {
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: inAmount,
        slippageBps: 50,
      },
    });

    const quote = quoteResponse.data;

    if (!quote.routes || quote.routes.length === 0) {
      console.log('.');
      return null;
    }

    const swapResponse = await axios.post('https://quote-api.jup.ag/v6/swap', {
      route: quote.routes[0],
      userPublicKey: wallet.publicKey.toBase58(),
      wrapUnwrapSOL: true,
    });

    const swapTx = swapResponse.data.swapTransaction;
    const txBuffer = Buffer.from(swapTx, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);

    const sig = await connection.sendTransaction(transaction, [wallet]);
    console.log('Jupiter swap sent:', sig);
    return sig;

  } catch (error) {
    console.error('Jupiter swap error:', error.response?.data || error.message);
    return null;
  }
}

async function buyAndBurnToken() {
  try {
    console.log('Starting Buy and Burn Process...');

    if (PUMPSWAP_REWARD) {
      await claimPumpFunCreatorFee();
    } else {
      console.log('PUMPSWAP_REWARD is false. Skipping reward claim.');
    }

    if (cachedBalance === null) {
      cachedBalance = await safeRpcCall(
        () => connection.getBalance(wallet.publicKey),
        () => fallbackConnection.getBalance(wallet.publicKey)
      );
    }

    console.log(`Current SOL Balance: ${(cachedBalance / 1e9).toFixed(6)} SOL`);
    const amountToUse = cachedBalance - MIN_BALANCE_SOL;
    if (amountToUse <= 0) {
      console.log('Insufficient SOL balance to proceed.');
      return;
    }

    const solMint = new PublicKey('So11111111111111111111111111111111111111112');
    const targetMint = new PublicKey(TARGET_TOKEN_MINT);
    const swapTx = await executeJupiterSwap(solMint, targetMint, BigInt(amountToUse));
    if (!swapTx) return;

    const associatedTokenAccount = await getAssociatedTokenAddress(targetMint, wallet.publicKey);
    const mintInfo = await getMint(connection, targetMint);
    const tokenBalance = await getTokenAccountBalanceWithRetry(associatedTokenAccount);

    if (tokenBalance === BigInt(0)) {
      console.log('Token account has zero balance. Skipping burn.');
      return;
    }

    const burnInstruction = createBurnInstruction(
      associatedTokenAccount,
      targetMint,
      wallet.publicKey,
      tokenBalance
    );

    const transaction = new Transaction().add(burnInstruction);
    try {
      const burnTx = await connection.sendTransaction(transaction, [wallet]);
      console.log(`Burn transaction sent: ${burnTx}`);
      await connection.confirmTransaction(burnTx, 'confirmed');
      console.log('Tokens burned successfully.');
    } catch (error) {
      console.error('Burn transaction error:', error.message);
    }
  } catch (error) {
    console.error('Error during Buy and Burn:', error.message);
  } finally {
    cachedBalance = null;
    cachedBlockhash = null;
  }
}

const intervalMinutes = parseInt(INTERVAL.replace('m', '')) || 30;
schedule.scheduleJob(`*/${intervalMinutes} * * * *`, buyAndBurnToken);
console.log('Bot is running...');
