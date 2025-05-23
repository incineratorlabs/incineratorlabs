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
  getMint
} = require('@solana/spl-token');
const schedule = require('node-schedule');
const bs58 = require('bs58');
const axios = require('axios');
require('dotenv').config();

const WebSocket = require('ws');

// ✅ WebSocket Log Setup
let ws;
function initWebSocket() {
  ws = new WebSocket('wss://burn.incineratorlabs.xyz');
  ws.on('open', () => console.log('[log stream] connected'));
  ws.on('close', () => {
    console.log('[log stream] disconnected, retrying...');
    setTimeout(initWebSocket, 3000);
  });
  ws.on('error', err => console.error('[log stream error]', err.message));
}
const originalLog = console.log;
console.log = (...args) => {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  originalLog(msg);
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(msg);
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
const wallet = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

console.log('Wallet Public Key:', wallet.publicKey.toBase58());

let cachedBlockhash = null;
let lastBlockhashTs = 0;
async function getSafeBlockhash() {
  const now = Date.now();
  if (!cachedBlockhash || now - lastBlockhashTs > 30000) {
    const { blockhash } = await connection.getLatestBlockhash();
    cachedBlockhash = blockhash;
    lastBlockhashTs = now;
  }
  return cachedBlockhash;
}

async function claimPumpFunCreatorFee() {
  console.log('🧾 Claiming Pump.fun Creator Fee...');
  const programId = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  const instructionData = Buffer.from("1416567bc61cdb84", "hex");
  const keys = [
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: new PublicKey("9PRQYGFwcGhaMBx3KiPy62MSzaFyETDZ5U8Qr2HAavTX"), isSigner: false, isWritable: true },
    { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
    { pubkey: new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1"), isSigner: false, isWritable: false },
    { pubkey: programId, isSigner: false, isWritable: false },
  ];

  const instruction = new TransactionInstruction({ keys, programId, data: instructionData });
  const blockhash = (await connection.getLatestBlockhash()).blockhash;

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: wallet.publicKey,
  }).add(instruction);

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet], {
      skipPreflight: true,
      commitment: 'confirmed'
    });
    console.log('✅ Claim TX sent:', sig);
  } catch (error) {
    console.error('❌ Claim failed:', error.message);
  }
}


async function executeJupiterSwap(inputMint, outputMint, amountLamports) {
  try {
    console.log(`🔁 Swapping ${Number(amountLamports) / 1e9} SOL...`);
    const quoteRes = await axios.get('https://quote-api.jup.ag/v6/quote', {
      params: {
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amount: amountLamports.toString(),
        slippageBps: 50,
      }
    });

    if (!quoteRes.data.routes || quoteRes.data.routes.length === 0) {
      console.error('⚠️ No Jupiter routes available.');
      return null;
    }

    const swapRes = await axios.post('https://quote-api.jup.ag/v6/swap', {
      route: quoteRes.data.routes[0],
      userPublicKey: wallet.publicKey.toBase58(),
      wrapUnwrapSOL: true
    });

    const txBuffer = Buffer.from(swapRes.data.swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuffer);
    const sig = await connection.sendTransaction(tx, [wallet]);
    console.log('✅ Swap TX:', sig);
    return sig;
  } catch (err) {
    console.error('🧨 Jupiter error:', err.response?.data || err.message);
    await new Promise(res => setTimeout(res, 500 + Math.random() * 1000));
    return null;
  }
}

async function getTokenBalance(tokenAccount) {
  try {
    const res = await connection.getTokenAccountBalance(tokenAccount);
    return BigInt(res.value.amount);
  } catch (e) {
    console.warn('⚠️ Failed to read token account:', e.message);
    return BigInt(0);
  }
}

async function buyAndBurnToken() {
  try {
    console.log('🔥 Running buy & burn cycle');

    if (PUMPSWAP_REWARD) await claimPumpFunCreatorFee();

    const balance = await connection.getBalance(wallet.publicKey);
    const amountToUse = balance - MIN_BALANCE_SOL;
    console.log(`💰 Balance: ${(balance / 1e9).toFixed(4)} SOL | Using: ${(amountToUse / 1e9).toFixed(4)} SOL`);

    if (amountToUse <= 0) {
      console.log('❌ Not enough SOL to proceed.');
      return;
    }

    const solMint = new PublicKey('So11111111111111111111111111111111111111112');
    const targetMint = new PublicKey(TARGET_TOKEN_MINT);
    const swapSig = await executeJupiterSwap(solMint, targetMint, BigInt(amountToUse));
    if (!swapSig) return;

    const tokenAccount = await getAssociatedTokenAddress(targetMint, wallet.publicKey);
    const tokenBalance = await getTokenBalance(tokenAccount);

    if (tokenBalance === BigInt(0)) {
      console.log('🧼 No tokens to burn.');
      return;
    }

    const burnTx = new Transaction().add(
      createBurnInstruction(tokenAccount, targetMint, wallet.publicKey, tokenBalance)
    );
    burnTx.recentBlockhash = await getSafeBlockhash();
    burnTx.feePayer = wallet.publicKey;

    const burnSig = await sendAndConfirmTransaction(connection, burnTx, [wallet], {
      skipPreflight: true,
      commitment: 'confirmed'
    });

    console.log('🔥 Burned tokens. TX:', burnSig);
  } catch (err) {
    console.error('🧨 Burn cycle error:', err.message);
  }
}

const intervalMinutes = parseInt(INTERVAL.replace('m', '')) || 30;
schedule.scheduleJob(`*/${intervalMinutes} * * * *`, () => {
  const jitter = Math.floor(Math.random() * 15000); // up to 15s jitter
  setTimeout(buyAndBurnToken, jitter);
});
console.log(`🟢 Bot running every ${intervalMinutes} minutes...`);
