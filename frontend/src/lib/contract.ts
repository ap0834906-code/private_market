import { ethers } from "ethers";

export const PRIVATE_MARKET_ADDRESS =
  (import.meta.env.VITE_PRIVATE_MARKET_ADDRESS as string | undefined) ??
  "0x8Aea87A640C68EC6b9BAA5A610964F71cAd39257";

export const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

// Full ABI surface needed by the app.
export const PrivateMarketAbi = [
  "function marketCount() view returns (uint256)",
  "function getMarket(uint256) view returns (address sponsor,string question,uint256 resolutionDate,bool resolved,bool outcome,uint256 liquidityCap,uint256 totalEscrowed,uint256 totalWinShares,uint256 lastUpdateTs)",
  "function getSponsor(address) view returns (string name,bool isWhitelisted,uint256 totalMarketsCreated)",
  "function getEncBalanceHandle(address user) view returns (bytes32)",
  "function getYesSharesHandle(uint256 marketId,address trader) view returns (bytes32)",
  "function getNoSharesHandle(uint256 marketId,address trader) view returns (bytes32)",
  "function hasPendingTrade(address trader) view returns (bool)",
  "function getPendingLowerHandle(address trader) view returns (bytes32)",
  "function previewPayout(uint256 marketId,uint64 shares) view returns (uint256)",
  "function deposit(uint256 amount) external",
  "function withdraw(uint256 amount) external",
  "function createMarket(string question,uint256 resolutionDate,uint256 liquidityCap,uint64 initialLiquidity,uint256 seedLiquidity) external",
  "function trade(uint256 marketId,bool isBuyYes,bytes32 encAmount,bytes inputProof) external",
  "function requestSettlementProof() external",
  "function settleTrade(uint128 plaintextLower,bytes abiEncodedCleartexts,bytes decryptionProof) external",
  "function requestSponsorView(uint256 marketId) external",
  "function resolveMarket(uint256 marketId,bool outcome,uint256 totalWinningShares) external",
  "function preparePayout(uint256 marketId) external",
  "function claimPayout(uint256 marketId,bytes abiEncodedCleartexts,bytes decryptionProof) external",
  "event TradeSettled(uint256 indexed marketId, address indexed trader)",
  "event PayoutClaimed(uint256 indexed marketId, address indexed trader, uint64 shares, uint256 usdcAmount)",
];

export const UsdcAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 value) returns (bool)",
  "function decimals() view returns (uint8)",
];

export function createContract(providerOrSigner: any) {
  return new ethers.Contract(PRIVATE_MARKET_ADDRESS, PrivateMarketAbi, providerOrSigner);
}

export function createUsdcContract(providerOrSigner: any) {
  return new ethers.Contract(USDC_ADDRESS, UsdcAbi, providerOrSigner);
}

export function contractRead(provider: any) {
  return createContract(provider);
}

export function contractWrite(signer: any) {
  return createContract(signer);
}

// export async function connectWallet(): Promise<{
//   provider: ethers.BrowserProvider | null;
//   signer: ethers.Signer | null;
//   address?: string;
// }> {
//   if ((window as any).ethereum == null) return { provider: null, signer: null };
//   const provider = new ethers.BrowserProvider((window as any).ethereum as any);
//   await provider.send("eth_requestAccounts", []);
//   const signer = await provider.getSigner();
//   const address = await signer.getAddress();
//   return { provider, signer, address };
// }


const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111 in hex

export async function connectWallet(): Promise<{
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address?: string;
}> {
  if ((window as any).ethereum == null) return { provider: null, signer: null };

  // Request accounts first
  const provider = new ethers.BrowserProvider((window as any).ethereum as any);
  await provider.send("eth_requestAccounts", []);

  // Switch to Sepolia
  try {
    await provider.send("wallet_switchEthereumChain", [
      { chainId: SEPOLIA_CHAIN_ID },
    ]);
  } catch (switchError: any) {
    // Error 4902 = chain not added to wallet yet — add it
    if (switchError.code === 4902) {
      await provider.send("wallet_addEthereumChain", [
        {
          chainId: SEPOLIA_CHAIN_ID,
          chainName: "Sepolia Testnet",
          nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.sepolia.org"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        },
      ]);
    } else {
      throw switchError;
    }
  }

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { provider, signer, address };
}