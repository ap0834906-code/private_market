import { ethers } from "ethers";

type EthereumProvider = ethers.Eip1193Provider;

const DEFAULT_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? "11155111");
const DEFAULT_NETWORK_NAME = import.meta.env.VITE_NETWORK_NAME ?? (DEFAULT_CHAIN_ID === 31337 ? "localhost" : "sepolia");
const DEFAULT_RPC_URL =
  import.meta.env.VITE_RPC_URL ??
  (DEFAULT_CHAIN_ID === 31337 ? "http://127.0.0.1:8545" : "https://ethereum-sepolia.publicnode.com");

export const NETWORK = {
  name: DEFAULT_NETWORK_NAME,
  chainId: DEFAULT_CHAIN_ID,
  chainIdHex: `0x${DEFAULT_CHAIN_ID.toString(16)}`,
  rpcUrl: DEFAULT_RPC_URL,
  isLocal: DEFAULT_CHAIN_ID === 31337,
};

export const PRIVATE_MARKET_ADDRESS =
  (import.meta.env.VITE_PRIVATE_MARKET_ADDRESS as string | undefined) ??
  "0x0000000000000000000000000000000000000000";

export const USDC_ADDRESS =
  (import.meta.env.VITE_USDC_ADDRESS as string | undefined) ??
  "0x0000000000000000000000000000000000000000";

export const PrivateMarketAbi = [
  "function marketCount() view returns (uint256)",
  "function getMarket(uint256) view returns (address sponsor,string question,uint256 resolutionDate,bool resolved,bool outcome,uint256 liquidityCap,uint256 totalEscrowed,uint256 totalWinShares,uint256 lastUpdateTs)",
  "function getSponsor(address) view returns (string name,bool isWhitelisted,uint256 totalMarketsCreated)",
  "function getEncBalanceHandle(address user) view returns (bytes32)",
  "function getYesSharesHandle(uint256 marketId,address trader) view returns (bytes32)",
  "function getNoSharesHandle(uint256 marketId,address trader) view returns (bytes32)",
  "function getYesPoolHandle(uint256 marketId) view returns (bytes32)",
  "function getNoPoolHandle(uint256 marketId) view returns (bytes32)",
  "function getTotalYesSharesHandle(uint256 marketId) view returns (bytes32)",
  "function getTotalNoSharesHandle(uint256 marketId) view returns (bytes32)",
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
  "function mint(address to,uint256 amount) external",
];

export function getInjectedProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  const maybeEthereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  return maybeEthereum ?? null;
}

export function createContract(providerOrSigner: ethers.ContractRunner) {
  return new ethers.Contract(PRIVATE_MARKET_ADDRESS, PrivateMarketAbi, providerOrSigner);
}

export function createUsdcContract(providerOrSigner: ethers.ContractRunner) {
  return new ethers.Contract(USDC_ADDRESS, UsdcAbi, providerOrSigner);
}

export function contractRead(provider: ethers.ContractRunner) {
  return createContract(provider);
}

export function contractWrite(signer: ethers.ContractRunner) {
  return createContract(signer);
}

export async function connectWallet(): Promise<{
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address?: string;
}> {
  const injected = getInjectedProvider();
  if (!injected) return { provider: null, signer: null };

  const provider = new ethers.BrowserProvider(injected);
  await provider.send("eth_requestAccounts", []);

  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: NETWORK.chainIdHex }]);
  } catch (switchError) {
    const error = switchError as {
      code?: number;
      error?: { code?: number };
      info?: { error?: { code?: number } };
    };
    const code = error.code ?? error.error?.code ?? error.info?.error?.code;

    if (code === 4902) {
      await provider.send("wallet_addEthereumChain", [
        {
          chainId: NETWORK.chainIdHex,
          chainName: NETWORK.isLocal ? "Local Hardhat" : "Sepolia Testnet",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [NETWORK.rpcUrl],
          blockExplorerUrls: NETWORK.isLocal ? [] : ["https://sepolia.etherscan.io"],
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
