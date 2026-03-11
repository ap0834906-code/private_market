import hre from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
import { ethers as ethersLib } from "ethers";
import type { PrivateMarket } from "../types";

/**
 * PrivateMarket full flow on Sepolia — with encrypted balance deposit system.
 *
 * Key design:
 *   - Users deposit plaintext USDC once → contract credits encrypted internal balance
 *   - Trades deduct from encrypted balance via FHE.select (no revert, no leak)
 *   - Trade amounts are fully hidden — only deposit amount is visible on-chain
 *   - Winnings are credited back to encrypted balance, withdrawn anytime
 *
 * Full flow:
 *   deposit()                  → USDC in, encBalance credited
 *   trade()                    → deducts encAmount from encBalance via FHE.select
 *   requestSettlementProof()   → makePubliclyDecryptable(encLower)
 *   publicDecrypt([handle])    → { abiEncodedClearValues, decryptionProof }
 *   settleTrade(lower,enc,proof)
 *   resolveMarket(id,outcome,totalWinShares)
 *   preparePayout()            → makePubliclyDecryptable(encYesShares)
 *   publicDecrypt([handle])    → { abiEncodedClearValues, decryptionProof }
 *   claimPayout(enc,proof)     → credits USDC back to encBalance
 *   withdraw()                 → encBalance out as plaintext USDC
 *
 * Usage:
 *   PRIVATE_MARKET_ADDRESS=0x... npx hardhat run scripts/PrivateMarketSepolia.ts --network sepolia
 */

// Sepolia USDC — 6 decimals
// Faucet: https://faucet.circle.com
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

// // Amounts — all in USDC 6-decimal units
// const SEED_LIQUIDITY   = 5n  * 1_000_00n; // 0.5 USDC — sponsor seeds the market
// const TRADER_DEPOSIT   = 2n  * 1_000_00n; // 0.2 USDC — trader deposits into contract
// const TRADE_AMOUNT     = 1n;               // 1 AMM units — encrypted trade size
const SEED_LIQUIDITY = 500_000n;   // 0.5 USDC
const TRADER_DEPOSIT = 200_000n;   // 0.2 USDC  
const TRADE_AMOUNT   = 100_000n;   // 0.1 USDC — large enough relative to pool
async function ensureApproval(
  usdc: ethersLib.Contract,
  owner: HardhatEthersSigner,
  spender: string,
  amount: bigint,
  label: string
) {
  const allowance = await usdc.allowance(owner.address, spender) as bigint;
  if (allowance < amount) {
    console.log(`  Approving ${label}...`);
    await (await usdc.connect(owner).approve(spender, amount * 2n)).wait(); // approve 2x for headroom
    console.log(`  ✓ Approved`);
  } else {
    console.log(`  ✓ Already approved`);
  }
}

async function main() {
  const { ethers, fhevm } = hre;

  const contractAddress = process.env.PRIVATE_MARKET_ADDRESS;
  if (!contractAddress) throw new Error("Set PRIVATE_MARKET_ADDRESS env var");

  const rpcUrl = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia.publicnode.com";

  await fhevm.initializeCLIApi();

  const signers: HardhatEthersSigner[] = await ethers.getSigners();
  const admin   = signers[0];
  const sponsor = signers[1] ?? admin;
  const trader  = signers[2] ?? admin;

  const contract = await ethers.getContractAt(
    "PrivateMarket",
    contractAddress
  ) as unknown as PrivateMarket;

  const usdc = new ethersLib.Contract(USDC_ADDRESS, USDC_ABI, ethers.provider);

  const instance = await createInstance({
    ...SepoliaConfig,
    network: rpcUrl,
  });

  console.log("PrivateMarket Sepolia — Encrypted Balance Flow");
  console.log("-----------------------------------------------");
  console.log(`Contract: ${contractAddress}`);
  console.log(`USDC:     ${USDC_ADDRESS}`);
  console.log(`Admin:    ${admin.address}`);
  console.log(`Sponsor:  ${sponsor.address}`);
  console.log(`Trader:   ${trader.address}`);
  console.log("");

  // ── Check USDC balances ──────────────────────────────────────────────────────
  const sponsorBal = await usdc.balanceOf(sponsor.address) as bigint;
  const traderBal  = await usdc.balanceOf(trader.address)  as bigint;
  console.log(`Sponsor wallet USDC: ${sponsorBal / 1_000_000n} USDC`);
  console.log(`Trader  wallet USDC: ${traderBal  / 1_000_000n} USDC`);
  if (sponsorBal < SEED_LIQUIDITY) throw new Error("Sponsor needs .5+ USDC — get from https://faucet.circle.com");
  if (traderBal  < TRADER_DEPOSIT) throw new Error("Trader needs .2+ USDC — get from https://faucet.circle.com");
  console.log("");

  // ── 1. Register + whitelist sponsor ─────────────────────────────────────────
  const sponsorInfo = await contract.getSponsor(sponsor.address);
  if (!sponsorInfo.isWhitelisted) {
    console.log("Registering sponsor...");
    await (await contract.connect(sponsor).registerSponsor("Sepolia Sponsor")).wait();
    console.log("Whitelisting sponsor...");
    await (await contract.connect(admin).whitelistSponsor(sponsor.address)).wait();
    console.log("✓ Sponsor ready\n");
  } else {
    console.log("✓ Sponsor already whitelisted\n");
  }

  // ── 2. Trader deposits USDC → gets encrypted internal balance ────────────────
  console.log(`Trader depositing ${TRADER_DEPOSIT / 1_000_000n} USDC into contract...`);
  await ensureApproval(usdc, trader, contractAddress, TRADER_DEPOSIT, "trader deposit");
  await (await contract.connect(trader).deposit(TRADER_DEPOSIT)).wait();
  console.log(`✓ Trader deposited — encrypted balance credited\n`);

  // ── 3. Sponsor approves USDC + creates market ────────────────────────────────
  console.log(`Sponsor approving ${SEED_LIQUIDITY / 1_000_000n} USDC for market seed...`);
  await ensureApproval(usdc, sponsor, contractAddress, SEED_LIQUIDITY, "seed liquidity");

  const resolutionDate = Math.floor(Date.now() / 1000) - 10;
  console.log("Creating market (.5 USDC seed)...");
  const createTx = await contract.connect(sponsor).createMarket(
    "Will ETH reach $10k this year?",
    resolutionDate,
    100_000n,
    1000n,
    SEED_LIQUIDITY
  );
  const receipt = await createTx.wait();
  const event = receipt?.logs
    .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find((e) => e?.name === "MarketCreated");
  const marketId = (event?.args?.marketId ?? 0n) as bigint;
  console.log(`✓ Market created: id=${marketId}, .5 USDC seeded\n`);

  // ── 4. Encrypt trade amount and submit trade ─────────────────────────────────
  // encAmount is hidden — contract deducts from encrypted balance via FHE.select
  // If encrypted balance >= encAmount → deducts normally
  // If encrypted balance < encAmount  → deducts 0, trade has no effect (no revert)
  console.log(`Encrypting trade amount (${TRADE_AMOUNT} units, buying YES)...`);
  const input = fhevm.createEncryptedInput(contractAddress, trader.address);
  input.add64(TRADE_AMOUNT);
  const enc = await input.encrypt();

  console.log("Calling trade() — deducts from encrypted balance...");
  await (await contract.connect(trader).trade(
    marketId, true, enc.handles[0], enc.inputProof
  )).wait();
  console.log("✓ trade() submitted — encrypted balance deducted\n");

  // ── 5. Request settlement proof ──────────────────────────────────────────────
  console.log("Calling requestSettlementProof()...");
  await (await contract.connect(trader).requestSettlementProof()).wait();
  console.log("✓ encLower marked publicly decryptable\n");

  // ── 6. publicDecrypt encLower ────────────────────────────────────────────────
  const lowerHandle = await contract.getPendingLowerHandle(trader.address);
  console.log(`encLower handle: ${lowerHandle}`);

  console.log("Calling publicDecrypt() for encLower...");
  const settlementResult = await instance.publicDecrypt([lowerHandle]);
  const plaintextLower = settlementResult.clearValues[lowerHandle as keyof typeof settlementResult.clearValues] as bigint;
  console.log(`✓ plaintextLower = ${plaintextLower}\n`);

  // ── 7. settleTrade ───────────────────────────────────────────────────────────
  console.log("Calling settleTrade()...");
  await (await contract.connect(trader).settleTrade(
    plaintextLower,
    settlementResult.abiEncodedClearValues,
    settlementResult.decryptionProof
  )).wait();
  console.log("✓ settleTrade() done — encrypted YES shares credited\n");

  // ── 8. Resolve market ────────────────────────────────────────────────────────
  // In production: sponsor calls requestSponsorView() then userDecrypts encYesPool
  // to get the real totalWinningShares. Using placeholder here for demo.
  const totalWinningShares = 100n;
  console.log(`Resolving market (YES wins, totalWinningShares=${totalWinningShares})...`);
  await (await contract.connect(sponsor).resolveMarket(
    marketId, true, totalWinningShares
  )).wait();
  console.log("✓ Market resolved YES\n");

  // ── 9. preparePayout ─────────────────────────────────────────────────────────
  console.log("Calling preparePayout()...");
  await (await contract.connect(trader).preparePayout(marketId)).wait();
  console.log("✓ encYesShares marked publicly decryptable\n");

  // ── 10. publicDecrypt winning shares ─────────────────────────────────────────
  const yesHandle = await contract.getYesSharesHandle(marketId, trader.address);
  console.log(`encYesShares handle: ${yesHandle}`);

  console.log("Calling publicDecrypt() for encYesShares...");
  const payoutResult = await instance.publicDecrypt([yesHandle]);
  const winningShares = payoutResult.clearValues[yesHandle as keyof typeof payoutResult.clearValues] as bigint;
  console.log(`✓ winningShares = ${winningShares}\n`);

  // ── 11. claimPayout — winnings credited to encrypted balance ─────────────────
  console.log("Calling claimPayout()...");
  const claimTx = await contract.connect(trader).claimPayout(
    marketId,
    payoutResult.abiEncodedClearValues,
    payoutResult.decryptionProof
  );
  const claimReceipt = await claimTx.wait();
  const claimEvent = claimReceipt?.logs
    .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find((e) => e?.name === "PayoutClaimed");
  const usdcPaid = (claimEvent?.args?.usdcAmount ?? 0n) as bigint;
  console.log(`✓ claimPayout() done — ${usdcPaid / 1_000_000n} USDC credited to encrypted balance\n`);

  // ── 12. Optional: trader reads their encrypted balance via userDecrypt ────────
  console.log("Reading trader encrypted balance via userDecrypt...");
  const balHandle = await contract.getEncBalanceHandle(trader.address);
  console.log(`  encBalance handle: ${balHandle}`);

  const keypair   = instance.generateKeypair();
  const startTime = Math.floor(Date.now() / 1000);
  const duration  = 10;
  const eip712    = instance.createEIP712(keypair.publicKey, [contractAddress], startTime, duration);
  const signature = await trader.signTypedData(
    eip712.domain,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message
  );
  const balResult = await instance.userDecrypt(
    [{ handle: balHandle, contractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    signature.replace("0x", ""),
    [contractAddress],
    trader.address,
    startTime,
    duration
  );
  const plaintextBalance = balResult[balHandle] as bigint;
  console.log(`✓ Trader encrypted balance = ${plaintextBalance / 1_000_000n} USDC\n`);

  // ── 13. Trader withdraws remaining balance ────────────────────────────────────
  // NOTE: withdraw() takes a plaintext amount. Frontend should gate this
  // by first reading balance via userDecrypt so trader knows how much to withdraw.
  const withdrawAmount = plaintextBalance;
  if (withdrawAmount > 0n) {
    console.log(`Withdrawing ${withdrawAmount / 1_000_000n} USDC...`);
    await (await contract.connect(trader).withdraw(withdrawAmount)).wait();
    const walletBalAfter = await usdc.balanceOf(trader.address) as bigint;
    console.log(`✓ Withdrawn — trader wallet USDC: ${walletBalAfter / 1_000_000n} USDC\n`);
  }

  console.log("──────────────────────────────────────────────");
  console.log("Demo completed successfully ✓");
  console.log(`  Market ID:        ${marketId}`);
  console.log(`  Trader:           ${trader.address}`);
  console.log(`  Winning shares:   ${winningShares}`);
  console.log(`  USDC paid out:    ${usdcPaid / 1_000_000n} USDC`);
  console.log("──────────────────────────────────────────────");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
// import hre from "hardhat";
// import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
// import { createInstance , SepoliaConfig} from "@zama-fhe/relayer-sdk/node";
// import type { PrivateMarket } from "../types";

// /**
//  * Full PrivateMarket flow on Sepolia.
//  *
//  * Your contract's settlement flow:
//  *   trade()                    → queues PendingTrade, encLower wallet-gated
//  *   requestSettlementProof()   → makePubliclyDecryptable(encLower)
//  *   getPendingLowerHandle()    → returns bytes32 handle
//  *   publicDecrypt([handle])    → { abiEncodedClearValues, decryptionProof }
//  *   settleTrade(lower, enc, proof)
//  *
//  * Your contract's payout flow:
//  *   preparePayout()            → makePubliclyDecryptable(encYesShares/encNoShares)
//  *   getYesSharesHandle()       → returns bytes32 handle
//  *   publicDecrypt([handle])    → { abiEncodedClearValues, decryptionProof }
//  *   claimPayout(enc, proof)
//  *
//  * Usage:
//  *   PRIVATE_MARKET_ADDRESS=0x... npx hardhat run scripts/PrivateMarketSepolia.ts --network sepolia
//  */
// async function main() {
//   const { ethers, fhevm } = hre;

//   const contractAddress = process.env.PRIVATE_MARKET_ADDRESS;
//   if (!contractAddress) throw new Error("Set PRIVATE_MARKET_ADDRESS env var");

//   await fhevm.initializeCLIApi();

//   const signers: HardhatEthersSigner[] = await ethers.getSigners();
//   const admin   = signers[0];
//   const sponsor = signers[1] ?? admin;
//   const trader  = signers[2] ?? admin;

//   const contract = await ethers.getContractAt(
//     "PrivateMarket",
//     contractAddress
//   ) as unknown as PrivateMarket;

//   // Relayer SDK — node entry point (not the default browser build)
//   //const relayer = await createInstance(SepoliaConfig);
//   const relayer = await createInstance({
//     ...SepoliaConfig,
//     network: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia.publicnode.com",
//   });
//   console.log("PrivateMarket Sepolia demo");
//   console.log("--------------------------");
//   console.log(`Contract: ${contractAddress}`);
//   console.log(`Admin:    ${admin.address}`);
//   console.log(`Sponsor:  ${sponsor.address}`);
//   console.log(`Trader:   ${trader.address}`);
//   console.log("");

//   // ── 1. Register + whitelist sponsor ────────────────────────────────────────
//   const sponsorInfo = await contract.getSponsor(sponsor.address);
//   if (!sponsorInfo.isWhitelisted) {
//     console.log("Registering sponsor...");
//     await (await contract.connect(sponsor).registerSponsor("Sepolia Sponsor")).wait();
//     console.log("Whitelisting sponsor (admin)...");
//     await (await contract.connect(admin).whitelistSponsor(sponsor.address)).wait();
//     console.log("✓ Sponsor ready");
//   } else {
//     console.log("✓ Sponsor already whitelisted");
//   }

//   // ── 2. Create market ────────────────────────────────────────────────────────
//   // resolutionDate in the past so we can resolve immediately after trading
//   const resolutionDate = Math.floor(Date.now() / 1000) - 10;

//   console.log("\nCreating market...");
//   const createTx = await contract.connect(sponsor).createMarket(
//     "Will ETH reach $10k this year?",
//     resolutionDate,
//     100_000n,
//     1000n
//   );
//   const createReceipt = await createTx.wait();
//   const createdEvent = createReceipt?.logs
//     .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
//     .find((e) => e?.name === "MarketCreated");
//   const marketId = (createdEvent?.args?.marketId ?? 0n) as bigint;
//   console.log(`✓ Market created: id=${marketId}`);

//   // ── 3. Encrypt and submit trade ─────────────────────────────────────────────
//   console.log("\nEncrypting trade amount...");
//   const input = fhevm.createEncryptedInput(contractAddress, trader.address);
//   input.add64(100n);
//   const enc = await input.encrypt();

//   console.log("Calling trade()...");
//   await (await contract.connect(trader).trade(
//     marketId,
//     true,                // buying YES
//     enc.handles[0],
//     enc.inputProof
//   )).wait();
//   console.log("✓ trade() submitted");

//   // ── 4. Request settlement proof ─────────────────────────────────────────────
//   // This calls makePubliclyDecryptable(encLower) so publicDecrypt can work
//   console.log("\nCalling requestSettlementProof()...");
//   await (await contract.connect(trader).requestSettlementProof()).wait();
//   console.log("✓ encLower marked publicly decryptable");

//   // ── 5. Get handle and publicDecrypt via relayer ─────────────────────────────
//   console.log("Fetching encLower handle...");
//   const lowerHandle = await contract.getPendingLowerHandle(trader.address);
//   console.log(`  handle: ${lowerHandle}`);

//   console.log("Calling relayer publicDecrypt() for encLower...");
//   const settlementResult = await relayer.publicDecrypt([lowerHandle]);
//   const plaintextLower = settlementResult.clearValues[lowerHandle as keyof typeof settlementResult.clearValues] as bigint;
//   console.log(`✓ plaintextLower = ${plaintextLower}`);

//   // ── 6. settleTrade ─────────────────────────────────────────────────────────
//   console.log("\nCalling settleTrade()...");
//   await (await contract.connect(trader).settleTrade(
//     plaintextLower,
//     settlementResult.abiEncodedClearValues,
//     settlementResult.decryptionProof
//   )).wait();
//   console.log("✓ settleTrade() done");

//   // ── 7. Resolve market ───────────────────────────────────────────────────────
//   console.log("\nResolving market (outcome = YES)...");
//   await (await contract.connect(sponsor).resolveMarket(marketId, true)).wait();
//   console.log("✓ Market resolved YES");

//   // ── 8. preparePayout ───────────────────────────────────────────────────────
//   // This calls makePubliclyDecryptable(encYesShares) so publicDecrypt can work
//   console.log("\nCalling preparePayout()...");
//   await (await contract.connect(trader).preparePayout(marketId)).wait();
//   console.log("✓ encYesShares marked publicly decryptable");

//   // ── 9. Get YES shares handle and publicDecrypt ──────────────────────────────
//   console.log("Fetching encYesShares handle...");
//   const yesHandle = await contract.getYesSharesHandle(marketId, trader.address);
//   console.log(`  handle: ${yesHandle}`);

//   console.log("Calling relayer publicDecrypt() for encYesShares...");
//   const payoutResult = await relayer.publicDecrypt([yesHandle]);
//   const winningShares = payoutResult.clearValues[yesHandle as keyof typeof payoutResult.clearValues] as bigint;
//   console.log(`✓ winningShares = ${winningShares}`);

//   // ── 10. claimPayout ────────────────────────────────────────────────────────
//   console.log("\nCalling claimPayout()...");
//   await (await contract.connect(trader).claimPayout(
//     marketId,
//     payoutResult.abiEncodedClearValues,
//     payoutResult.decryptionProof
//   )).wait();
//   console.log("✓ claimPayout() done");

//   console.log("\n──────────────────────────────────────");
//   console.log("Demo completed successfully ✓");
//   console.log(`  Market ID:      ${marketId}`);
//   console.log(`  Trader:         ${trader.address}`);
//   console.log(`  Winning shares: ${winningShares}`);
//   console.log("──────────────────────────────────────");
// }

// main().catch((err) => {
//   console.error(err);
//   process.exitCode = 1;
// });


// // import hre from "hardhat";
// // import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
// // import { createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/node";
// // import type { PrivateMarket } from "../types";

// // /**
// //  * PrivateMarket full flow on Sepolia.
// //  *
// //  * Settlement flow (wallet-gated, no public leak):
// //  *   trade()                 → encLower allowed to trader only
// //  *   getPendingLowerHandle() → bytes32 handle
// //  *   userDecrypt(handle)     → plaintextLower (wallet-gated, no proof needed)
// //  *   settleTrade(lower)      → just passes plaintext, no checkSignatures
// //  *
// //  * Payout flow (publicDecrypt — shares are revealed at claim time):
// //  *   preparePayout()         → makePubliclyDecryptable(encYesShares)
// //  *   getYesSharesHandle()    → bytes32 handle
// //  *   publicDecrypt(handle)   → { abiEncodedClearValues, decryptionProof }
// //  *   claimPayout(enc, proof) → checkSignatures verifies, payout executed
// //  *
// //  * Usage:
// //  *   PRIVATE_MARKET_ADDRESS=0x... npx hardhat run scripts/PrivateMarketSepolia.ts --network sepolia
// //  */
// // async function main() {
// //   const { ethers, fhevm } = hre;

// //   const contractAddress = process.env.PRIVATE_MARKET_ADDRESS;
// //   if (!contractAddress) throw new Error("Set PRIVATE_MARKET_ADDRESS env var");

// //   const rpcUrl = "https://ethereum-sepolia.publicnode.com";
// //   if (!rpcUrl) throw new Error("Set SEPOLIA_RPC_URL env var");

// //   await fhevm.initializeCLIApi();

// //   const signers: HardhatEthersSigner[] = await ethers.getSigners();
// //   const admin   = signers[0];
// //   const sponsor = signers[1] ?? admin;
// //   const trader  = signers[2] ?? admin;

// //   const contract = await ethers.getContractAt(
// //     "PrivateMarket",
// //     contractAddress
// //   ) as unknown as PrivateMarket;

// //   // Relayer instance — must pass network RPC in Node (no window.ethereum)
// //   const instance = await createInstance({
// //     ...SepoliaConfig,
// //     network: rpcUrl,
// //   });

// //   console.log("PrivateMarket Sepolia demo");
// //   console.log("--------------------------");
// //   console.log(`Contract: ${contractAddress}`);
// //   console.log(`Admin:    ${admin.address}`);
// //   console.log(`Sponsor:  ${sponsor.address}`);
// //   console.log(`Trader:   ${trader.address}`);
// //   console.log("");

// //   // ── 1. Register + whitelist sponsor ────────────────────────────────────────
// //   const sponsorInfo = await contract.getSponsor(sponsor.address);
// //   if (!sponsorInfo.isWhitelisted) {
// //     console.log("Registering sponsor...");
// //     await (await contract.connect(sponsor).registerSponsor("Sepolia Sponsor")).wait();
// //     console.log("Whitelisting sponsor...");
// //     await (await contract.connect(admin).whitelistSponsor(sponsor.address)).wait();
// //     console.log("✓ Sponsor ready\n");
// //   } else {
// //     console.log("✓ Sponsor already whitelisted\n");
// //   }

// //   // ── 2. Create market ────────────────────────────────────────────────────────
// //   const resolutionDate = Math.floor(Date.now() / 1000) - 10; // past → can resolve immediately
// //   console.log("Creating market...");
// //   const createTx = await contract.connect(sponsor).createMarket(
// //     "Will ETH reach $10k this year?",
// //     resolutionDate,
// //     100_000n,
// //     1000n
// //   );
// //   const receipt = await createTx.wait();
// //   const event = receipt?.logs
// //     .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
// //     .find((e) => e?.name === "MarketCreated");
// //   const marketId = (event?.args?.marketId ?? 0n) as bigint;
// //   console.log(`✓ Market created: id=${marketId}\n`);

// //   // ── 3. Encrypt and submit trade ─────────────────────────────────────────────
// //   console.log("Encrypting trade amount (100 units, buying YES)...");
// //   const input = fhevm.createEncryptedInput(contractAddress, trader.address);
// //   input.add64(100n);
// //   const enc = await input.encrypt();

// //   console.log("Calling trade()...");
// //   await (await contract.connect(trader).trade(
// //     marketId, true, enc.handles[0], enc.inputProof
// //   )).wait();
// //   console.log("✓ trade() submitted\n");

// //   // ── 4. Decrypt encLower via userDecrypt (wallet-gated, no public leak) ───────
// //   // encLower = NO_pool + amount — only the trader can decrypt this
// //   // No makePubliclyDecryptable — privacy preserved
// //   console.log("Fetching encLower handle...");
// //   const lowerHandle = await contract.getPendingLowerHandle(trader.address);
// //   console.log(`  handle: ${lowerHandle}`);

// //   console.log("Decrypting encLower via userDecrypt (wallet-gated)...");
// //   const keypair   = instance.generateKeypair();
// //   const startTime = Math.floor(Date.now() / 1000);
// //   const duration  = 10;

// //   const eip712 = instance.createEIP712(
// //     keypair.publicKey,
// //     [contractAddress],
// //     startTime,
// //     duration
// //   );
// //   const signature = await trader.signTypedData(
// //     eip712.domain,
// //     { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
// //     eip712.message
// //   );
// //   const lowerResult = await instance.userDecrypt(
// //     [{ handle: lowerHandle, contractAddress }],
// //     keypair.privateKey,
// //     keypair.publicKey,
// //     signature.replace("0x", ""),
// //     [contractAddress],
// //     trader.address,
// //     startTime,
// //     duration
// //   );
// //   const plaintextLower = lowerResult[lowerHandle] as bigint;
// //   console.log(`✓ plaintextLower = ${plaintextLower}\n`);

// //   // ── 5. settleTrade — just passes plaintext, no proof needed ─────────────────
// //   console.log("Calling settleTrade()...");
// //   await (await contract.connect(trader).settleTrade(plaintextLower)).wait();
// //   console.log("✓ settleTrade() done\n");

// //   // ── 6. Resolve market ───────────────────────────────────────────────────────
// //   console.log("Resolving market (YES wins)...");
// //   await (await contract.connect(sponsor).resolveMarket(marketId, true)).wait();
// //   console.log("✓ Market resolved YES\n");

// //   // ── 7. preparePayout ───────────────────────────────────────────────────────
// //   // Makes encYesShares publicly decryptable — this is acceptable because
// //   // the market is already resolved and the trader is claiming their payout.
// //   // The share count is revealed at claim time, not during trading.
// //   console.log("Calling preparePayout()...");
// //   await (await contract.connect(trader).preparePayout(marketId)).wait();
// //   console.log("✓ preparePayout() done\n");

// //   // ── 8. publicDecrypt winning shares ────────────────────────────────────────
// //   console.log("Fetching encYesShares handle...");
// //   const yesHandle = await contract.getYesSharesHandle(marketId, trader.address);
// //   console.log(`  handle: ${yesHandle}`);

// //   console.log("Calling publicDecrypt() for winning shares...");
// //   const payoutResult = await instance.publicDecrypt([yesHandle]);
// //   const winningShares = payoutResult.clearValues[yesHandle as keyof typeof payoutResult.clearValues] as bigint;
// //   console.log(`✓ winningShares = ${winningShares}\n`);

// //   // ── 9. claimPayout ─────────────────────────────────────────────────────────
// //   console.log("Calling claimPayout()...");
// //   await (await contract.connect(trader).claimPayout(
// //     marketId,
// //     payoutResult.abiEncodedClearValues,
// //     payoutResult.decryptionProof
// //   )).wait();
// //   console.log("✓ claimPayout() done\n");

// //   console.log("──────────────────────────────────────");
// //   console.log("Demo completed successfully ✓");
// //   console.log(`  Market ID:      ${marketId}`);
// //   console.log(`  Trader:         ${trader.address}`);
// //   console.log(`  Winning shares: ${winningShares}`);
// //   console.log("──────────────────────────────────────");
// // }

// // main().catch((err) => {
// //   console.error(err);
// //   process.exitCode = 1;
// // });