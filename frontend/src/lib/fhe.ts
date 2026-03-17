import { createInstance, initSDK, SepoliaConfig } from "@zama-fhe/relayer-sdk/web";
import { ethers } from "ethers";
import { NETWORK, PRIVATE_MARKET_ADDRESS, getInjectedProvider } from "./contract";

export { initSDK };

type RelayerInstance = Awaited<ReturnType<typeof createInstance>>;

type RelayerMetadata = {
  ACLAddress: string;
  KMSVerifierAddress: string;
  InputVerifierAddress: string;
  gatewayChainId: number;
};

let relayerInstance: RelayerInstance | null = null;
let relayerInstancePromise: Promise<RelayerInstance> | null = null;

function getLocalConfigFromEnv() {
  const verifyingContractAddressDecryption = import.meta.env.VITE_GATEWAY_DECRYPTION_ADDRESS as string | undefined;
  const verifyingContractAddressInputVerification = import.meta.env.VITE_GATEWAY_INPUT_VERIFICATION_ADDRESS as
    | string
    | undefined;
  const kmsContractAddress = import.meta.env.VITE_KMS_CONTRACT_ADDRESS as string | undefined;
  const inputVerifierContractAddress = import.meta.env.VITE_INPUT_VERIFIER_CONTRACT_ADDRESS as string | undefined;
  const aclContractAddress = import.meta.env.VITE_ACL_CONTRACT_ADDRESS as string | undefined;
  const gatewayChainId = Number(import.meta.env.VITE_GATEWAY_CHAIN_ID ?? "0");
  const relayerUrl = import.meta.env.VITE_RELAYER_URL as string | undefined;

  if (
    verifyingContractAddressDecryption &&
    verifyingContractAddressInputVerification &&
    kmsContractAddress &&
    inputVerifierContractAddress &&
    aclContractAddress &&
    gatewayChainId &&
    relayerUrl
  ) {
    return {
      verifyingContractAddressDecryption,
      verifyingContractAddressInputVerification,
      kmsContractAddress,
      inputVerifierContractAddress,
      aclContractAddress,
      gatewayChainId,
      relayerUrl,
      chainId: NETWORK.chainId,
    };
  }

  return null;
}

async function getLocalMetadataConfig() {
  const provider = getInjectedProvider();
  if (!provider) return null;

  const metadata = (await provider.request({
    method: "fhevm_relayer_metadata",
    params: [],
  })) as Partial<RelayerMetadata> | null;

  const decryption = import.meta.env.VITE_GATEWAY_DECRYPTION_ADDRESS as string | undefined;
  const inputVerification = import.meta.env.VITE_GATEWAY_INPUT_VERIFICATION_ADDRESS as string | undefined;

  if (
    !metadata?.ACLAddress ||
    !metadata?.KMSVerifierAddress ||
    !metadata?.InputVerifierAddress ||
    !metadata?.gatewayChainId ||
    !decryption ||
    !inputVerification
  ) {
    return null;
  }

  return {
    verifyingContractAddressDecryption: decryption,
    verifyingContractAddressInputVerification: inputVerification,
    kmsContractAddress: metadata.KMSVerifierAddress,
    inputVerifierContractAddress: metadata.InputVerifierAddress,
    aclContractAddress: metadata.ACLAddress,
    gatewayChainId: metadata.gatewayChainId,
    relayerUrl: import.meta.env.VITE_RELAYER_URL ?? NETWORK.rpcUrl,
    chainId: NETWORK.chainId,
  };
}

async function resolveRelayerConfig() {
  if (!NETWORK.isLocal) return SepoliaConfig;
  return (await getLocalMetadataConfig()) ?? getLocalConfigFromEnv();
}

export async function getRelayerInstance() {
  if (relayerInstance) return relayerInstance;
  if (relayerInstancePromise) return relayerInstancePromise;

  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error("Ethereum provider not found. Please connect your wallet first.");
  }

  const config = await resolveRelayerConfig();
  if (!config) {
    throw new Error("Missing local FHE config. Set the VITE_GATEWAY_* and VITE_*_CONTRACT_ADDRESS values.");
  }

  relayerInstancePromise = createInstance({
    ...config,
    network: provider,
  })
    .then((instance) => {
      relayerInstance = instance;
      relayerInstancePromise = null;
      return instance;
    })
    .catch((error) => {
      relayerInstancePromise = null;
      throw error;
    });

  return relayerInstancePromise;
}

export function resetRelayerInstance() {
  relayerInstance = null;
  relayerInstancePromise = null;
}

export const USDC_DECIMALS = 6;
export const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS);

export function toUsdcUnits(amount: number | string): bigint {
  const value = typeof amount === "string" ? Number(amount || "0") : amount;
  return BigInt(Math.floor(value * 10 ** USDC_DECIMALS));
}

export function fromUsdcUnits(value: bigint | number | string): number {
  const raw =
    typeof value === "bigint"
      ? value
      : BigInt(typeof value === "string" ? value || "0" : Math.trunc(value));
  return Number(raw) / 10 ** USDC_DECIMALS;
}

export async function userDecryptHandle(
  handle: string,
  signer: ethers.Signer,
  contractAddress: string = PRIVATE_MARKET_ADDRESS,
): Promise<bigint> {
  const instance = await getRelayerInstance();
  const keypair = instance.generateKeypair();
  const startTime = Math.floor(Date.now() / 1000);
  const duration = 300;
  const userAddress = await signer.getAddress();

  const eip712 = instance.createEIP712(keypair.publicKey, [contractAddress], startTime, duration);
  const signature = await signer.signTypedData(
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

export async function publicDecryptHandles(handles: string[]) {
  const instance = await getRelayerInstance();
  const { abiEncodedClearValues, decryptionProof, clearValues } = await instance.publicDecrypt(handles);
  return {
    abiEncodedClearValues,
    decryptionProof,
    clearValues: clearValues as Record<string, bigint>,
  };
}

export async function encryptUint64(
  value: bigint,
  userAddress: string,
  contractAddress: string = PRIVATE_MARKET_ADDRESS,
): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
  const instance = await getRelayerInstance();
  const input = await instance.createEncryptedInput(contractAddress, userAddress);
  input.add64(value);
  return input.encrypt();
}
