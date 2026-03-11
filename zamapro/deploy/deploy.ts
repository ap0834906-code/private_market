// // import { DeployFunction } from "hardhat-deploy/types";
// // import { HardhatRuntimeEnvironment } from "hardhat/types";

// // const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
// //   const { deployer } = await hre.getNamedAccounts();
// //   const { deploy } = hre.deployments;

// //   const deployedFHECounter = await deploy("FHECounter", {
// //     from: deployer,
// //     log: true,
// //   });

// //   console.log(`FHECounter contract: `, deployedFHECounter.address);
// // };
// // export default func;
// // func.id = "deploy_fheCounter"; // id required to prevent reexecution
// // func.tags = ["FHECounter"];
// /**
//  * deploy.ts — Deployment script for PrivateMarket
//  *
//  * Usage:
//  *   npx hardhat run scripts/deploy.ts --network localhost
//  *   npx hardhat run scripts/deploy.ts --network sepolia
//  *
//  * What it does:
//  *   1. Deploys PrivateMarket contract
//  *   2. Registers deployer as the first sponsor
//  *   3. Whitelists the deployer (for local dev convenience)
//  *   4. Creates a sample market
//  *   5. Prints all addresses and contract details
//  *
//  * For production: remove step 3 (whitelistSponsor) and gate it with onlyAdmin.
//  */

// import { ethers } from "hardhat";
// import { fhevm } from "hardhat";

// async function main() {
//   await fhevm.initializeCLIApi();

//   const [deployer] = await ethers.getSigners();
//   const network = await ethers.provider.getNetwork();

//   console.log("─────────────────────────────────────────────");
//   console.log("PrivateMarket Deployment");
//   console.log("─────────────────────────────────────────────");
//   console.log(`Network:   ${network.name} (chainId: ${network.chainId})`);
//   console.log(`Deployer:  ${deployer.address}`);
//   console.log(`Balance:   ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);
//   console.log("");

//   // ── 1. Deploy ────────────────────────────────────────────────────────────

//   console.log("Deploying PrivateMarket...");
//   const Factory = await ethers.getContractFactory("PrivateMarket");
//   const contract = await Factory.deploy();
//   await contract.waitForDeployment();
//   const contractAddr = await contract.getAddress();
//   console.log(`✓ PrivateMarket deployed at: ${contractAddr}`);
//   console.log("");

//   // ── 2. Register deployer as sponsor ──────────────────────────────────────

//   console.log("Registering deployer as sponsor...");
//   const registerTx = await contract.registerSponsor("Genesis Sponsor");
//   await registerTx.wait();
//   console.log(`✓ Sponsor registered: "Genesis Sponsor"`);

//   // ── 3. Whitelist (dev convenience — remove in production) ────────────────

//   console.log("Whitelisting deployer (dev mode)...");
//   const whitelistTx = await contract.whitelistSponsor(deployer.address);
//   await whitelistTx.wait();
//   console.log(`✓ Deployer whitelisted`);
//   console.log(`  ⚠️  NOTE: whitelistSponsor has no onlyAdmin guard yet.`);
//   console.log(`     Add OpenZeppelin Ownable before mainnet.`);
//   console.log("");

//   // ── 4. Create sample market ───────────────────────────────────────────────

//   const resolutionDate = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // 1 week
//   const liquidityCap   = 100_000n;
//   const initialLiquidity = 1000n;

//   console.log("Creating sample market...");
//   const createTx = await contract.createMarket(
//     "Will ETH reach $10,000 by end of 2026?",
//     resolutionDate,
//     liquidityCap,
//     initialLiquidity
//   );
//   const createReceipt = await createTx.wait();

//   const event = createReceipt?.logs
//     .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
//     .find((e) => e?.name === "MarketCreated");
//   const marketId = event?.args?.marketId ?? 0n;

//   console.log(`✓ Market #${marketId} created`);
//   console.log(`  Question:       "Will ETH reach $10,000 by end of 2026?"`);
//   console.log(`  Resolution:     ${new Date(resolutionDate * 1000).toISOString()}`);
//   console.log(`  LiquidityCap:   ${liquidityCap}`);
//   console.log(`  InitLiquidity:  ${initialLiquidity} (500 YES / 500 NO)`);
//   console.log("");

//   // ── 5. Summary ───────────────────────────────────────────────────────────

//   console.log("─────────────────────────────────────────────");
//   console.log("DEPLOYMENT SUMMARY");
//   console.log("─────────────────────────────────────────────");
//   console.log(`Contract:         ${contractAddr}`);
//   console.log(`Deployer/Sponsor: ${deployer.address}`);
//   console.log(`Markets created:  1 (id=0)`);
//   console.log("");
//   console.log("Next steps:");
//   console.log("  1. Save contract address in your .env as PRIVATE_MARKET_ADDRESS");
//   console.log("  2. Fund traders and call trade() with encrypted amounts");
//   console.log("  3. Sponsor calls requestSponsorView() to monitor encrypted pools");
//   console.log("  4. After resolutionDate: sponsor calls resolveMarket(id, outcome)");
//   console.log("  5. Traders call preparePayout() → decrypt → claimPayout()");
//   console.log("─────────────────────────────────────────────");
// }

// main().catch((err) => {
//   console.error(err);
//   process.exitCode = 1;
// });


/**
 * deploy.ts — Deployment script for PrivateMarket
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network localhost
 *   npx hardhat run scripts/deploy.ts --network sepolia
 *
 * What it does:
 *   1. Deploys PrivateMarket contract (passing Sepolia USDC address)
 *   2. Registers deployer as the first sponsor
 *   3. Whitelists the deployer (dev convenience)
 *   4. Approves USDC seed liquidity
 *   5. Creates a sample market with 500 USDC seed
 *   6. Prints all addresses and contract details
 *
 * Pre-requisites:
 *   - Deployer wallet needs Sepolia ETH (for gas)
 *   - Deployer wallet needs Sepolia USDC (get from https://faucet.circle.com)
 *
 * For production: remove step 3 (whitelistSponsor) and gate it with onlyAdmin.
 */

import { ethers } from "hardhat";
import { fhevm } from "hardhat";

// Sepolia USDC — 6 decimals
// Faucet: https://faucet.circle.com
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

const SEED_LIQUIDITY = 6n * 1_000_000n; // 6 USDC (6 decimals)

async function main() {
  await fhevm.initializeCLIApi();

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, deployer);

  console.log("─────────────────────────────────────────────");
  console.log("PrivateMarket Deployment");
  console.log("─────────────────────────────────────────────");
  console.log(`Network:   ${network.name} (chainId: ${network.chainId})`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Balance:   ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

  const usdcBal = await usdc.balanceOf(deployer.address) as bigint;
  console.log(`USDC:      ${usdcBal / 1_000_000n} USDC`);

  if (usdcBal < SEED_LIQUIDITY) {
    throw new Error(
      `Deployer needs at least 6 USDC to seed the sample market.\n` +
      `Get Sepolia USDC from: https://faucet.circle.com`
    );
  }
  console.log("");

  // ── 1. Deploy ────────────────────────────────────────────────────────────

  console.log("Deploying PrivateMarket...");
  const Factory = await ethers.getContractFactory("PrivateMarket");

  // Constructor now takes usdcAddress
  const contract = await Factory.deploy(USDC_ADDRESS);
  await contract.waitForDeployment();
  const contractAddr = await contract.getAddress();
  console.log(`✓ PrivateMarket deployed at: ${contractAddr}`);
  console.log(`  USDC address: ${USDC_ADDRESS}`);
  console.log("");

  // ── 2. Register deployer as sponsor ──────────────────────────────────────

  console.log("Registering deployer as sponsor...");
  await (await contract.registerSponsor("Genesis Sponsor")).wait();
  console.log(`✓ Sponsor registered: "Genesis Sponsor"`);

  // ── 3. Whitelist (dev convenience — remove in production) ────────────────

  console.log("Whitelisting deployer (dev mode)...");
  await (await contract.whitelistSponsor(deployer.address)).wait();
  console.log(`✓ Deployer whitelisted`);
  console.log(`  ⚠️  NOTE: Remove auto-whitelist before mainnet.`);
  console.log("");

  // ── 4. Approve USDC seed liquidity ───────────────────────────────────────

  console.log("Approving USDC seed liquidity (6 USDC)...");
  const allowance = await usdc.allowance(deployer.address, contractAddr) as bigint;
  if (allowance < SEED_LIQUIDITY) {
    await (await usdc.approve(contractAddr, SEED_LIQUIDITY)).wait();
    console.log(`✓ Approved 6 USDC`);
  } else {
    console.log(`✓ Already approved`);
  }
  console.log("");

  // ── 5. Create sample market ───────────────────────────────────────────────

  const resolutionDate   = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // 1 week
  const liquidityCap     = 100_000n;
  const initialLiquidity = 1000n;

  console.log("Creating sample market (6 USDC seed)...");
  const createTx = await contract.createMarket(
    "Will ETH reach $10,000 by end of 2026?",
    resolutionDate,
    liquidityCap,
    initialLiquidity,
    SEED_LIQUIDITY   // 6 USDC pulled from deployer wallet into contract escrow
  );
  const createReceipt = await createTx.wait();

  const event = createReceipt?.logs
    .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
    .find((e) => e?.name === "MarketCreated");
  const marketId = event?.args?.marketId ?? 0n;

  console.log(`✓ Market #${marketId} created`);
  console.log(`  Question:       "Will ETH reach $10,000 by end of 2026?"`);
  console.log(`  Resolution:     ${new Date(resolutionDate * 1000).toISOString()}`);
  console.log(`  LiquidityCap:   ${liquidityCap}`);
  console.log(`  InitLiquidity:  ${initialLiquidity} (500 YES / 500 NO)`);
  console.log(`  Seed USDC:      ${SEED_LIQUIDITY / 1_000_000n} USDC escrowed`);
  console.log("");

  // ── 6. Summary ───────────────────────────────────────────────────────────

  console.log("─────────────────────────────────────────────");
  console.log("DEPLOYMENT SUMMARY");
  console.log("─────────────────────────────────────────────");
  console.log(`Contract:         ${contractAddr}`);
  console.log(`USDC:             ${USDC_ADDRESS}`);
  console.log(`Deployer/Sponsor: ${deployer.address}`);
  console.log(`Markets created:  1 (id=${marketId})`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Add to your .env:`);
  console.log(`     PRIVATE_MARKET_ADDRESS=${contractAddr}`);
  console.log(`  2. Traders call deposit() with USDC to get encrypted balance`);
  console.log(`  3. Traders call trade() with encrypted amount`);
  console.log(`  4. Sponsor calls requestSponsorView() to monitor encrypted pools`);
  console.log(`  5. After resolutionDate: sponsor calls resolveMarket(id, outcome, totalWinShares)`);
  console.log(`  6. Traders call preparePayout() → publicDecrypt → claimPayout()`);
  console.log(`  7. Traders call withdraw() to get USDC back to wallet`);
  console.log("─────────────────────────────────────────────");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});