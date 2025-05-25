const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const {
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} = require('@solana/spl-token');
const bs58 = require('bs58');
require('dotenv').config();

const wallet = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY));
const connection = new Connection(
  "YOUR_RPC",
  'confirmed'
);

console.log('🔐 Wallet loaded:', wallet.publicKey.toBase58());

async function burnAllTokens() {
  try {
    console.log('⏳ Checking wallet for tokens...');

    const tokenPrograms = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

    for (const programId of tokenPrograms) {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        programId
      });

      if (tokenAccounts.value.length === 0) {
        console.log(`❌ No token accounts found for program ID: ${programId.toBase58()}`);
        continue;
      }

      for (const { pubkey, account } of tokenAccounts.value) {
        try {
          const info = account.data.parsed.info;
          const mint = new PublicKey(info.mint);
          const amount = BigInt(info.tokenAmount.amount);
          const decimals = info.tokenAmount.decimals;

          if (amount === 0n) {
            console.log(`⚠️  ${mint.toBase58()} is 0, skipping.`);
            continue;
          }

          console.log(`🧪 Burning ${Number(amount) / 10 ** decimals} of ${mint.toBase58()}`);

          const burnIx = createBurnInstruction(
            pubkey,
            mint,
            wallet.publicKey,
            amount,
            [],
            programId
          );

          const tx = new Transaction().add(burnIx);
          const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);

          console.log(`🔥 Burned → https://solscan.io/tx/${sig}`);
        } catch (innerErr) {
          console.error(`💥 Error burning ${pubkey.toBase58()}:`, innerErr.message);
        }
      }
    }
  } catch (err) {
    console.error('[ERROR]', err.message);
  }
}

setInterval(burnAllTokens, 1800 * 1000);
console.log('🧨 Incinerator wallet running...');
