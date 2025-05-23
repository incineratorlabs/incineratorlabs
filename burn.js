// Combined Buy, Claim, and Burn Script for IncineratorLabs (PumpSwap Integrated)

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  AddressLookupTableAccount,
  TransactionMessage,
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
const chalk = require('chalk');
require('dotenv').config();

const WebSocket = require('ws');

// === LOGGING ENHANCEMENT ===
const BADGE = chalk.hex('#ff0055')('[INCINERATOR🔥]');
const originalLog = console.log;

const log = {
  info: (...args) => logWithLabel('INFO', chalk.cyanBright, 'ℹ️', ...args),
  success: (...args) => logWithLabel('SUCCESS', chalk.greenBright, '✅', ...args),
  error: (...args) => logWithLabel('ERROR', chalk.redBright, '❌', ...args),
  warn: (...args) => logWithLabel('WARN', chalk.yellowBright, '⚠️', ...args),
  action: (...args) => logWithLabel('ACTION', chalk.magentaBright, '🔥', ...args),
};

function logWithLabel(label, colorFn, emoji, ...args) {
  const timestamp = chalk.gray(`[${new Date().toLocaleTimeString()}]`);
  const message = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const formatted = `${timestamp} ${BADGE} ${emoji} ${colorFn(`[${label}]`)} ${message}`;
  originalLog(formatted);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(`[${label}] ${emoji} ${message}`);
  }
}

// === INIT WEBSOCKET ===
let ws;
function initWebSocket() {
  ws = new WebSocket('wss://burn.incineratorlabs.xyz');

  ws.on('open', () => log.info('Connected to WebSocket dashboard'));
  ws.on('close', () => {
    log.warn('WebSocket disconnected, retrying...');
    setTimeout(initWebSocket, 3000);
  });
  ws.on('error', (err) => log.error('WebSocket error:', err.message));
}
initWebSocket();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TARGET_TOKEN_MINT = process.env.TARGET_TOKEN_MINT;
const INTERVAL = process.env.INTERVAL || '30m';
const BURN_RATIO = parseFloat(process.env.BURN_RATIO) || 0.01;
const MIN_BALANCE_SOL = BURN_RATIO * 1e9;
const PUMPSWAP_REWARD = process.env.PUMPSWAP_REWARD === 'true';

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const privateKeyArray = bs58.decode(PRIVATE_KEY);
const wallet = Keypair.fromSecretKey(privateKeyArray);
log.success('Wallet Public Key:', wallet.publicKey.toBase58());

async function getTokenAccountBalance(tokenAccount) {
  try {
    const accountInfo = await getAccount(connection, tokenAccount);
    return accountInfo.amount;
  } catch (error) {
    log.warn(`Token account ${tokenAccount.toBase58()} not found.`);
    return BigInt(0);
  }
}

const WSOL = new PublicKey('So11111111111111111111111111111111111111112');
const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

async function claimPumpFunCreatorFee() {
  log.action('Claiming Pump.fun Creator Fee...');
  try {
    const tx = new Transaction();

    const instruction = new TransactionInstruction({
      programId: PUMP_FUN_PROGRAM_ID,
      keys: [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true }, // creator
        { pubkey: new PublicKey('9PRQYGFwcGhaMBx3KiPy62MSzaFyETDZ5U8Qr2HAavTX'), isSigner: false, isWritable: true }, // creator vault
        { pubkey: new PublicKey('5vDRAWviVHWHQqYDMvQTZ5EoD2EBH9GkBhPbTSgWAjYC'), isSigner: false, isWritable: true }, // creator token ATA (WSOL)
        { pubkey: new PublicKey('FUNDp8XqEorEosg2ybmJMM6myah5Vy41WszyPKzf1gHJ'), isSigner: false, isWritable: true }, // fee vault
        { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isSigner: false, isWritable: false }, // token program
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system program
        { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false }, // rent (may or may not be needed)
        { pubkey: new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1'), isSigner: false, isWritable: false } // event authority
      ],
      data: Buffer.from("1416567bc61cdb84", "hex"), // anchor discriminator for CollectCreatorFee
    });

    tx.add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
    log.success("✅ Creator fee claimed:", sig);
  } catch (error) {
    log.error("❌ Claim transaction failed:", error.message);
  }
}



async function executePumpPortalSwap(outputMint, amountInSol) {
  log.action(`🧠 Swapping via PumpPortal: ${(amountInSol / 1e9).toFixed(4)} SOL → ${outputMint.toBase58()}`);

  try {
    const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        action: "buy",
        mint: outputMint.toBase58(),
        denominatedInSol: "true",
        amount: Number((amountInSol / 1e9).toFixed(6)), // Convert lamports to SOL
        slippage: 10,
        priorityFee: 0.00001,
        pool: "auto"
      })
    });

    if (response.status === 200) {
      const data = await response.arrayBuffer();
      const tx = VersionedTransaction.deserialize(new Uint8Array(data));
      tx.sign([wallet]);
      const signature = await connection.sendTransaction(tx);
      await connection.confirmTransaction(signature, 'confirmed');
      log.success('✅ PumpPortal swap confirmed! Tx:', signature);
      return signature;
    } else {
      const errorText = await response.text();
      log.error(`PumpPortal failed: ${response.status} ${response.statusText}`, errorText);
      return null;
    }

  } catch (error) {
    log.error('❌ PumpPortal swap error:', error.message);
    return null;
  }
}




async function buyAndBurnToken() {
  try {
    log.action('🔥 Starting Buy and Burn Process...');

    if (PUMPSWAP_REWARD) {
      await claimPumpFunCreatorFee();
    } else {
      log.info('PUMPSWAP_REWARD is false. Skipping reward claim.');
    }

    const balance = await connection.getBalance(wallet.publicKey);
    log.info(`Current SOL Balance: ${(balance / 1e9).toFixed(6)} SOL`);
    const amountToUse = balance - MIN_BALANCE_SOL;
    if (amountToUse <= 0) {
      log.warn('⚠️ Insufficient SOL balance to proceed.');
      return;
    }

    const solMint = WSOL;
    const targetMint = new PublicKey(TARGET_TOKEN_MINT);
	const swapTx = await executePumpPortalSwap(targetMint, amountToUse);
    if (!swapTx) return;

    const associatedTokenAccount = await getAssociatedTokenAddress(targetMint, wallet.publicKey);
    const tokenBalance = await getTokenAccountBalance(associatedTokenAccount);

    if (tokenBalance === BigInt(0)) {
      log.warn('Token account has zero balance. Skipping burn.');
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
      log.success(`Burn transaction sent: ${burnTx}`);
      await connection.confirmTransaction(burnTx, 'confirmed');
      log.success('🔥 Tokens burned successfully.');
    } catch (error) {
      log.error('Burn transaction error:', error.message);
    }
  } catch (error) {
    log.error('Error during Buy and Burn:', error.message);
  }
}

const intervalMinutes = parseInt(INTERVAL.replace('m', '')) || 30;
schedule.scheduleJob(`*/${intervalMinutes} * * * *`, buyAndBurnToken);
log.info('🤖 Bot is running...');
