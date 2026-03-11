import { initSDK, createInstance, SepoliaConfig } from "@zama-fhe/relayer-sdk/web";
import { ethers } from "ethers";
import { PRIVATE_MARKET_ADDRESS } from "./contract";

// ── SDK Initialization ────────────────────────────────────────────────────────
// Call this once at app startup (in main.tsx) before mounting React.
export { initSDK };

// ── Relayer Instance (singleton) ──────────────────────────────────────────────
let _relayerInstance: Awaited<ReturnType<typeof createInstance>> | null = null;
let _relayerInstancePromise: Promise<Awaited<ReturnType<typeof createInstance>>> | null = null;

export async function getRelayerInstance() {
  // Return cached resolved instance immediately
  if (_relayerInstance) return _relayerInstance;

  // Deduplicate concurrent calls — don't spin up multiple in-flight promises
  if (_relayerInstancePromise) return _relayerInstancePromise;

  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("Ethereum provider not found. Please connect your wallet first.");
  }

  _relayerInstancePromise = createInstance({
    // Use SepoliaConfig which has all correct contract addresses + relayerUrl
    // from the installed SDK version (verified via node -e SepoliaConfig)
    ...SepoliaConfig,
    // Pass window.ethereum as the network provider for browser
    network: (window as any).ethereum,
  }).then(instance => {
    _relayerInstance = instance;
    _relayerInstancePromise = null; // clear so errors don't get cached
    return instance;
  }).catch(err => {
    _relayerInstancePromise = null; // clear on failure so next call retries
    throw err;
  });

  return _relayerInstancePromise;
}

// Call this when wallet disconnects to force re-init on next use
export function resetRelayerInstance() {
  _relayerInstance = null;
  _relayerInstancePromise = null;
}

// ── USDC Helpers ──────────────────────────────────────────────────────────────

export const USDC_DECIMALS = 6;
export const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS);

/** Convert a human-readable USDC amount to on-chain units.
 *  e.g. toUsdcUnits(50) → 50_000_000n */
export function toUsdcUnits(amount: number | string): bigint {
  const num = typeof amount === "string" ? Number(amount || "0") : amount;
  return BigInt(Math.floor(num * 10 ** USDC_DECIMALS));
}

/** Convert on-chain USDC units to a human-readable number.
 *  e.g. fromUsdcUnits(50_000_000n) → 50 */
export function fromUsdcUnits(value: bigint | number | string): number {
  const v =
    typeof value === "bigint"
      ? value
      : BigInt(typeof value === "string" ? value || "0" : Math.trunc(value));
  return Number(v) / 10 ** USDC_DECIMALS;
}

// ── userDecrypt ───────────────────────────────────────────────────────────────

/**
 * Wallet-gated decryption — only the owner of the ciphertext can decrypt.
 * Used for: encrypted balance, YES/NO share positions.
 *
 * @param handle  bytes32 handle from contract (e.g. getEncBalanceHandle())
 * @param signer  connected wallet signer
 * @param contractAddress  defaults to PRIVATE_MARKET_ADDRESS
 * @returns plaintext bigint value, or 0n if handle is uninitialized
 */
export async function userDecryptHandle(
  handle: string,
  signer: ethers.Signer,
  contractAddress: string = PRIVATE_MARKET_ADDRESS,
): Promise<bigint> {
  const instance = await getRelayerInstance();
  const keypair = instance.generateKeypair();
  const startTime = Math.floor(Date.now() / 1000);
  const duration = 300; // 5 minutes — enough time for KMS response
  const userAddress = await signer.getAddress();

  const eip712 = instance.createEIP712(
    keypair.publicKey,
    [contractAddress],
    startTime,
    duration,
  );

  const signature = await (signer as any).signTypedData(
    eip712.domain,
    { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
    eip712.message,
  );

  const result = await instance.userDecrypt(
    [{ handle, contractAddress }],
    keypair.privateKey,
    keypair.publicKey,
    signature.replace("0x", ""),
    [contractAddress],
    userAddress,
    startTime,
    duration,
  );

  const plaintext = result[handle] as bigint | undefined;
  return plaintext ?? 0n;
}

// ── publicDecrypt ─────────────────────────────────────────────────────────────

/**
 * Public decryption — used for values marked makePubliclyDecryptable().
 * Used for: encLower (settlement), encYesShares/encNoShares (payout).
 * Returns abiEncodedClearValues + decryptionProof needed for on-chain verification.
 *
 * @param handles  array of bytes32 handles to decrypt
 */
export async function publicDecryptHandles(
  handles: string[],
): Promise<{
  abiEncodedClearValues: string;
  decryptionProof: string;
  clearValues: Record<string, bigint>;
}> {
  const instance = await getRelayerInstance();
  const { abiEncodedClearValues, decryptionProof, clearValues } =
    await instance.publicDecrypt(handles);
  return {
    abiEncodedClearValues,
    decryptionProof,
    clearValues: clearValues as Record<string, bigint>,
  };
}

// ── encryptInput ──────────────────────────────────────────────────────────────

/**
 * Encrypt a uint64 value for submission to the contract.
 * Used for: trade() encAmount.
 *
 * @param value     plaintext bigint to encrypt (in USDC 6-decimal units)
 * @param userAddress  trader's wallet address
 * @param contractAddress  defaults to PRIVATE_MARKET_ADDRESS
 * @returns { handles, inputProof } to pass to contract.trade()
 */
export async function encryptUint64(
  value: bigint,
  userAddress: string,
  contractAddress: string = PRIVATE_MARKET_ADDRESS,
): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
  const instance = await getRelayerInstance();
  const input = await instance.createEncryptedInput(contractAddress, userAddress);
  input.add64(value);
  const enc = await input.encrypt();
  return enc;
}