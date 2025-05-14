const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const axios = require('axios');
const schedule = require('node-schedule');
require('dotenv').config();

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TARGET_TOKEN_MINT = process.env.TARGET_TOKEN_MINT;
const INTERVAL = process.env.INTERVAL || '30m';
const BURN_RATIO = parseFloat(process.env.BURN_RATIO) || 0.01;
const MIN_BALANCE_SOL = BURN_RATIO * 1e9; // 0.01 SOL

const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
const wallet = Keypair.fromSecretKey(new Uint8Array(JSON.parse(PRIVATE_KEY)));

async function buyAndBurnToken() {
  try {
    console.log('Starting Buy and Burn Process...');

    // Fetch wallet balance
    const balance = await connection.getBalance(wallet.publicKey);
    const amountToUse = balance - MIN_BALANCE_SOL;

    if (amountToUse <= 0) {
      console.log('Insufficient balance to proceed. Skipping buy and burn.');
      return;
    }

    console.log(`Available SOL for buying: ${amountToUse / 1e9} SOL`);

    // Fetch token price and calculate how much to buy
    const response = await axios.get(`https://quote-api.jup.ag/v4/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${TARGET_TOKEN_MINT}&amount=${amountToUse}`);
    const bestQuote = response.data.data[0];
    const buyAmount = bestQuote.outAmount;

    console.log(`Buying ${buyAmount} tokens of ${TARGET_TOKEN_MINT}...`);

    // Construct transaction to buy tokens
    const transaction = new Transaction();
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey(TARGET_TOKEN_MINT),
        lamports: amountToUse,
      })
    );

    console.log('Sending transaction...');
    const signature = await connection.sendTransaction(transaction, [wallet]);
    console.log(`Transaction sent: ${signature}`);

    // Get associated token account
    const token = new Token(connection, new PublicKey(TARGET_TOKEN_MINT), TOKEN_PROGRAM_ID, wallet);
    const associatedTokenAccount = await token.getOrCreateAssociatedAccountInfo(wallet.publicKey);

    console.log(`Burning ${buyAmount} tokens...`);

    // Burn tokens
    await token.burn(associatedTokenAccount.address, wallet.publicKey, [], buyAmount);
    console.log('Tokens burned successfully.');

  } catch (error) {
    console.error('Error during Buy and Burn:', error.message);
  }
}

// Schedule the buy and burn every 30 minutes
schedule.scheduleJob(`*/${parseInt(INTERVAL)} * * * *`, buyAndBurnToken);

console.log('Bot is running...');
