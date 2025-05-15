const { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction 
} = require('@solana/web3.js');
const { 
  getAssociatedTokenAddress, 
  createBurnInstruction, 
  getMint, 
  getAccount 
} = require('@solana/spl-token');
const { Market } = require('@project-serum/serum');
const schedule = require('node-schedule');
const bs58 = require('bs58');
require('dotenv').config();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TARGET_TOKEN_MINT = process.env.TARGET_TOKEN_MINT;
const INTERVAL = process.env.INTERVAL || '30m';
const BURN_RATIO = parseFloat(process.env.BURN_RATIO) || 0.01;
const MIN_BALANCE_SOL = BURN_RATIO * 1e9;

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');

// Decode base58 private key
let privateKeyArray;
try {
  privateKeyArray = bs58.decode(PRIVATE_KEY);
  console.log('Private Key successfully decoded.');
} catch (error) {
  console.error('Error decoding base58 private key:', error.message);
  process.exit(1);
}

const wallet = Keypair.fromSecretKey(privateKeyArray);
console.log('Wallet Public Key:', wallet.publicKey.toBase58());

/**
 * Fetch the balance of a token account
 */
async function getTokenAccountBalance(tokenAccount) {
  try {
    const accountInfo = await getAccount(connection, tokenAccount);
    return accountInfo.amount;
  } catch (error) {
    console.warn(`Token account ${tokenAccount.toBase58()} not found.`);
    return BigInt(0);
  }
}

/**
 * Execute a swap using Serum
 */
async function executeSerumSwap(fromMint, toMint, amount) {
  try {
    console.log(`Swapping ${amount / 1e9} SOL to ${toMint.toBase58()}`);

    // Example Serum market (Replace with your market address)
    const marketAddress = new PublicKey('9wFFkjE1zY8mTukCTLPD9PLaEjfkdFkrb2GZg1iGLSbp'); // SOL/USDC Market
    const market = await Market.load(connection, marketAddress, {}, new PublicKey('4ckmDgGzLR5ZPPyCG1hn5q3uYYa3APoc2jFhR7zKeFzt'));

    const payer = wallet.publicKey;

    const transaction = new Transaction();
    const order = await market.makePlaceOrderInstruction({
      owner: wallet,
      payer,
      side: 'buy',
      price: 1, // Example price, adjust as needed
      size: amount / 1e9,
      orderType: 'limit',
    });

    transaction.add(order);

    const signature = await connection.sendTransaction(transaction, [wallet]);
    console.log(`Swap transaction sent: ${signature}`);

    return signature;
  } catch (error) {
    console.error('Serum swap error:', error.message);
    return null;
  }
}

/**
 * Buy and Burn Process
 */
async function buyAndBurnToken() {
  try {
    console.log('Starting Buy and Burn Process...');

    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`Current SOL Balance: ${(balance / 1e9).toFixed(6)} SOL`);

    const amountToUse = balance - MIN_BALANCE_SOL;

    if (amountToUse <= 0) {
      console.log('Insufficient SOL balance to proceed.');
      return;
    }

    console.log(`Available SOL for swap: ${(amountToUse / 1e9).toFixed(6)} SOL`);

    const solMint = new PublicKey('So11111111111111111111111111111111111111112');
    const targetMint = new PublicKey(TARGET_TOKEN_MINT);

    // Execute Serum Swap
    const swapTx = await executeSerumSwap(solMint, targetMint, BigInt(amountToUse));

    if (!swapTx) {
      console.log('Swap failed. Skipping burn process.');
      return;
    }

    console.log(`Swap completed: ${swapTx}`);

    // Get the associated token account
    const associatedTokenAccount = await getAssociatedTokenAddress(targetMint, wallet.publicKey);
    console.log(`Associated Token Account: ${associatedTokenAccount.toBase58()}`);

    const mintInfo = await getMint(connection, targetMint);
    const decimals = mintInfo.decimals;

    const tokenBalance = await getTokenAccountBalance(associatedTokenAccount);

    if (tokenBalance === BigInt(0)) {
      console.log('Token account has zero balance. Skipping burn.');
      return;
    }

    console.log(`Token balance after swap: ${tokenBalance.toString()} units`);

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
  }
}

// Convert INTERVAL to Cron format
const intervalMinutes = parseInt(INTERVAL.replace('m', '')) || 30;
const cronExpression = `*/${intervalMinutes} * * * *`;

// Schedule the buy and burn process
schedule.scheduleJob(cronExpression, buyAndBurnToken);

console.log('Bot is running...');
