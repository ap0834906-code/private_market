import { ethers } from "hardhat";
import { fhevm } from "hardhat";

const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

const USDC_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

const SEED_LIQUIDITY = 5n * 1_000_000n;

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

  const usdcBal = (await usdc.balanceOf(deployer.address)) as bigint;
  console.log(`USDC:      ${usdcBal / 1_000_000n} USDC`);

  if (usdcBal < SEED_LIQUIDITY) {
    throw new Error(
      `Deployer needs at least 5 USDC to seed the sample market.\n` +
        `Get Sepolia USDC from: https://faucet.circle.com`,
    );
  }
  console.log("");

  console.log("Deploying PrivateMarket...");
  const Factory = await ethers.getContractFactory("PrivateMarket");
  const contract = await Factory.deploy(USDC_ADDRESS);
  await contract.waitForDeployment();
  const contractAddr = await contract.getAddress();
  console.log(`✓ PrivateMarket deployed at: ${contractAddr}`);
  console.log(`  USDC address: ${USDC_ADDRESS}`);
  console.log("");

  console.log("Registering deployer as sponsor...");
  await (await contract.registerSponsor("Genesis Sponsor")).wait();
  console.log(`✓ Sponsor registered: "Genesis Sponsor"`);

  console.log("Whitelisting deployer (dev mode)...");
  await (await contract.whitelistSponsor(deployer.address)).wait();
  console.log("✓ Deployer whitelisted");
  console.log("  ⚠️  NOTE: Remove auto-whitelist before mainnet.");
  console.log("");

  console.log("Approving USDC seed liquidity (5 USDC)...");
  const allowance = (await usdc.allowance(deployer.address, contractAddr)) as bigint;
  if (allowance < SEED_LIQUIDITY) {
    await (await usdc.approve(contractAddr, SEED_LIQUIDITY)).wait();
    console.log("✓ Approved 5 USDC");
  } else {
    console.log("✓ Already approved");
  }
  console.log("");

  const resolutionDate = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  const liquidityCap = 100n * 1_000_000n;
  const initialLiquidity = 100n * 1_000_000n;

  console.log("Creating sample market (5 USDC seed)...");
  const createTx = await contract.createMarket(
    "Will ETH reach $10,000 by end of 2026?",
    resolutionDate,
    liquidityCap,
    initialLiquidity,
    SEED_LIQUIDITY,
  );
  const createReceipt = await createTx.wait();

  const event = createReceipt?.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "MarketCreated");
  const marketId = event?.args?.marketId ?? 0n;

  console.log(`✓ Market #${marketId} created`);
  console.log('  Question:       "Will ETH reach $10,000 by end of 2026?"');
  console.log(`  Resolution:     ${new Date(resolutionDate * 1000).toISOString()}`);
  console.log(`  LiquidityCap:   ${liquidityCap / 1_000_000n} USDC`);
  console.log(`  InitLiquidity:  ${initialLiquidity / 1_000_000n} units (${initialLiquidity / 2n / 1_000_000n} YES / ${initialLiquidity / 2n / 1_000_000n} NO)`);
  console.log(`  Seed USDC:      ${SEED_LIQUIDITY / 1_000_000n} USDC escrowed`);
  console.log("");

  console.log("─────────────────────────────────────────────");
  console.log("DEPLOYMENT SUMMARY");
  console.log("─────────────────────────────────────────────");
  console.log(`Contract:         ${contractAddr}`);
  console.log(`USDC:             ${USDC_ADDRESS}`);
  console.log(`Deployer/Sponsor: ${deployer.address}`);
  console.log(`Markets created:  1 (id=${marketId})`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Add to your .env:");
  console.log(`     PRIVATE_MARKET_ADDRESS=${contractAddr}`);
  console.log("  2. Traders call deposit() with USDC to get encrypted balance");
  console.log("  3. Traders call trade() with encrypted amount");
  console.log("  4. Sponsor calls requestSponsorView() to monitor encrypted pools");
  console.log("  5. After resolutionDate: sponsor calls resolveMarket(id, outcome, totalWinShares)");
  console.log("  6. Traders call preparePayout() → publicDecrypt → claimPayout()");
  console.log("  7. Frontend .env should point to the new contract address");
  console.log("─────────────────────────────────────────────");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
