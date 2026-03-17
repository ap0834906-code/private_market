import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, RefreshCcw, Vault } from "lucide-react";
import Navbar from "@/components/Navbar";
import TraderMarketCard from "@/components/TraderMarketCard";
import PositionCard, { type PositionView } from "@/components/PositionCard";
import TradeModal from "@/components/TradeModal";
import PendingBadge from "@/components/PendingBadge";
import { NETWORK, PRIVATE_MARKET_ADDRESS, contractRead, contractWrite, createUsdcContract, getInjectedProvider } from "@/lib/contract";
import { encryptUint64, fromUsdcUnits, publicDecryptHandles, toUsdcUnits, userDecryptHandle } from "@/lib/fhe";
import { useToast } from "@/components/ui/use-toast";
import { ethers } from "ethers";

interface OnchainMarket {
  id: bigint;
  question: string;
  resolutionDate: number;
  resolved: boolean;
  outcome: boolean;
  liquidityCap: bigint;
}

const TraderView = () => {
  const { toast } = useToast();
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [walletUsdc, setWalletUsdc] = useState<number | null>(null);
  const [encBalance, setEncBalance] = useState<number | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [markets, setMarkets] = useState<OnchainMarket[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [tab, setTab] = useState<"markets" | "positions">("markets");
  const [tradingMarket, setTradingMarket] = useState<OnchainMarket | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [tradeBreakdown, setTradeBreakdown] = useState<{ side: "YES" | "NO"; amount: number } | null>(null);
  const [depositInput, setDepositInput] = useState("");
  const [hasPending, setHasPending] = useState(false);
  const [positions, setPositions] = useState<PositionView[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [claimingMarketId, setClaimingMarketId] = useState<string | null>(null);
  const [hasHydratedCache, setHasHydratedCache] = useState(false);

  async function handleConnect() {
    const result = await connectWallet();
    if (result.provider && result.signer && result.address) {
      setProvider(result.provider);
      setSigner(result.signer);
      setAddress(result.address);
    }
  }

  useEffect(() => {
    const injected = getInjectedProvider();
    if (!injected || provider) return;
    const nextProvider = new ethers.BrowserProvider(injected);
    setProvider(nextProvider);
    nextProvider
      .getSigner()
      .then(async (nextSigner) => {
        setSigner(nextSigner);
        setAddress(await nextSigner.getAddress());
      })
      .catch(() => undefined);
  }, [provider]);

  const readContract = useMemo(
    () => (provider ? contractRead(provider) : null),
    [provider],
  );
  const storageKey = useMemo(
    () => (address ? `private-market:${NETWORK.chainId}:${address.toLowerCase()}` : null),
    [address],
  );

  function updateLocalCache(next: { encBalance?: number | null; positions?: PositionView[] }) {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const existing = window.localStorage.getItem(storageKey);
      const parsed = existing ? (JSON.parse(existing) as { encBalance?: number | null; positions?: PositionView[] }) : {};
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...parsed,
          ...next,
        }),
      );
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { encBalance?: number | null; positions?: PositionView[] };
      if (typeof parsed.encBalance === "number") {
        setEncBalance(parsed.encBalance);
      }
      if (Array.isArray(parsed.positions)) {
        setPositions(parsed.positions);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setHasHydratedCache(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) {
      setHasHydratedCache(false);
    }
  }, [storageKey]);

  async function refreshWalletBalance() {
    if (!provider || !address) return;
    try {
      setLoadingBalances(true);
      const usdc = createUsdcContract(provider);
      const walletBalance = await usdc.balanceOf(address);
      setWalletUsdc(fromUsdcUnits(walletBalance));
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingBalances(false);
    }
  }

  async function refreshBalances() {
    if (!provider || !signer || !address || !readContract) return;

    const progress = toast({
      title: "Refreshing private balance",
      description: "Decrypting your latest private balance snapshot.",
    });

    try {
      setLoadingBalances(true);
      const usdc = createUsdcContract(provider);
      const walletBalance = await usdc.balanceOf(address);
      const nextWalletBalance = fromUsdcUnits(walletBalance);
      setWalletUsdc(nextWalletBalance);

      const handle = await readContract.getEncBalanceHandle(address);
      if (handle && handle !== ethers.ZeroHash) {
        setDecrypting(true);
        const decrypted = await userDecryptHandle(handle, signer, PRIVATE_MARKET_ADDRESS);
        const nextBalance = fromUsdcUnits(decrypted);
        setEncBalance(nextBalance);
        updateLocalCache({ encBalance: nextBalance });
      } else {
        setEncBalance(0);
        updateLocalCache({ encBalance: 0 });
      }
    } catch (error) {
      console.error(error);
      progress.update({
        title: "Balance load failed",
        description: "Unable to refresh wallet and encrypted balances.",
        variant: "destructive",
      });
      return;
    } finally {
      setLoadingBalances(false);
      setDecrypting(false);
    }

    progress.update({
      title: "Private balance updated",
      description: "Your cached encrypted balance snapshot is now current.",
    });
  }

  async function loadMarkets() {
    if (!readContract) return;
    try {
      setLoadingMarkets(true);
      const count = (await readContract.marketCount()) as bigint;
      const nextMarkets: OnchainMarket[] = [];
      for (let index = 0n; index < count; index++) {
        const market = await readContract.getMarket(index);
        nextMarkets.push({
          id: index,
          question: market[1],
          resolutionDate: Number(market[2]),
          resolved: Boolean(market[3]),
          outcome: Boolean(market[4]),
          liquidityCap: market[5],
        });
      }
      setMarkets(nextMarkets);
    } catch (error) {
      console.error(error);
      toast({
        title: "Market load failed",
        description: "Unable to load markets from the contract.",
        variant: "destructive",
      });
    } finally {
      setLoadingMarkets(false);
    }
  }

  async function checkPending() {
    if (!address || !readContract) return;
    try {
      setHasPending(Boolean(await readContract.hasPendingTrade(address)));
    } catch (error) {
      console.error(error);
    }
  }

  async function loadPositions() {
    if (!address || !signer || !readContract) return;
    const progress = toast({
      title: "Refreshing positions",
      description: "Decrypting your cached position inventory.",
    });
    try {
      setLoadingPositions(true);
      const nextPositions: PositionView[] = [];
      for (const market of markets) {
        const yesHandle = await readContract.getYesSharesHandle(market.id, address).catch(() => ethers.ZeroHash);
        const noHandle = await readContract.getNoSharesHandle(market.id, address).catch(() => ethers.ZeroHash);

        if (yesHandle && yesHandle !== ethers.ZeroHash) {
          const yesShares = Number(await userDecryptHandle(yesHandle, signer, PRIVATE_MARKET_ADDRESS));
          if (yesShares > 0) {
            nextPositions.push({
              marketId: market.id.toString(),
              question: market.question,
              side: "YES",
              status: market.resolved ? "resolved" : "open",
              outcome: market.resolved ? (market.outcome ? "YES" : "NO") : undefined,
            });
          }
        }

        if (noHandle && noHandle !== ethers.ZeroHash) {
          const noShares = Number(await userDecryptHandle(noHandle, signer, PRIVATE_MARKET_ADDRESS));
          if (noShares > 0) {
            nextPositions.push({
              marketId: market.id.toString(),
              question: market.question,
              side: "NO",
              status: market.resolved ? "resolved" : "open",
              outcome: market.resolved ? (market.outcome ? "YES" : "NO") : undefined,
            });
          }
        }
      }
      setPositions(nextPositions);
      updateLocalCache({ positions: nextPositions });
    } catch (error) {
      console.error(error);
      progress.update({
        title: "Position load failed",
        description: "Unable to decrypt your position inventory.",
        variant: "destructive",
      });
      return;
    } finally {
      setLoadingPositions(false);
    }

    progress.update({
      title: "Positions updated",
      description: "Your local position snapshot is now current.",
    });
  }

  useEffect(() => {
    void loadMarkets();
    void refreshWalletBalance();
    void checkPending();
  }, [address, provider, signer, readContract]);

  async function handleDeposit(amount: number) {
    if (!signer || !address) return;
    try {
      setTxPending(true);
      toast({
        title: "Preparing deposit",
        description: "Waiting for wallet confirmations and on-chain credit.",
      });
      const usdc = createUsdcContract(signer);
      const depositAmount = toUsdcUnits(amount);
      const allowance = (await usdc.allowance(address, PRIVATE_MARKET_ADDRESS)) as bigint;
      if (allowance < depositAmount) {
        await (await usdc.approve(PRIVATE_MARKET_ADDRESS, depositAmount)).wait();
      }
      await (await contractWrite(signer).deposit(depositAmount)).wait();
      setDepositInput("");
      await refreshBalances();
      toast({
        title: "Deposit confirmed",
        description: "Your encrypted balance has been refreshed.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Deposit failed",
        description: "Approve and deposit USDC again, or check the wallet network.",
        variant: "destructive",
      });
    } finally {
      setTxPending(false);
    }
  }

  async function handleMintLocalUsdc() {
    if (!signer || !address || !NETWORK.isLocal) return;
    try {
      setTxPending(true);
      const usdc = createUsdcContract(signer);
      await (await usdc.mint(address, toUsdcUnits(500))).wait();
      await refreshBalances();
      toast({
        title: "Test USDC minted",
        description: "500 local mUSDC added to your wallet for local testing.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Mint failed",
        description: "Local faucet is only available when using the local mock USDC contract.",
        variant: "destructive",
      });
    } finally {
      setTxPending(false);
    }
  }

  async function settlePendingTrade() {
    if (!signer || !address) return;
    const contract = contractWrite(signer);
    toast({
      title: "Settlement in progress",
      description: "Decrypting the AMM denominator and settling your trade.",
    });
    await (await contract.requestSettlementProof()).wait();
    const handle = await contract.getPendingLowerHandle(address);
    const { abiEncodedClearValues, decryptionProof, clearValues } = await publicDecryptHandles([handle]);
    const plaintextLower = clearValues[handle] ?? 0n;
    await (await contract.settleTrade(plaintextLower, abiEncodedClearValues, decryptionProof)).wait();
  }

  async function handleTradeSubmit(market: OnchainMarket, side: "YES" | "NO", amount: number) {
    if (!signer || !address) return;
    try {
      setTxPending(true);
      setDecrypting(true);
      toast({
        title: "Trade submitted",
        description: "Encrypting your order and routing it through settlement.",
      });

      const encryptedAmount = toUsdcUnits(amount);
      const contract = contractWrite(signer);
      const encrypted = await encryptUint64(encryptedAmount, address, PRIVATE_MARKET_ADDRESS);
      await (await contract.trade(market.id, side === "YES", encrypted.handles[0], encrypted.inputProof)).wait();
      await settlePendingTrade();

      setTradeBreakdown({ side, amount });
      await refreshBalances();
      await checkPending();
      if (tab === "positions") await loadPositions();
      toast({
        title: "Trade settled",
        description: `${side} order completed and private state updated.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Trade failed",
        description: NETWORK.isLocal
          ? "Local FHE trade flow needs the localhost verifier env configured."
          : "Unable to complete encrypted trade settlement.",
        variant: "destructive",
      });
    } finally {
      setTxPending(false);
      setDecrypting(false);
    }
  }

  async function handleSettlePending() {
    if (!signer) return;
    try {
      setTxPending(true);
      setDecrypting(true);
      toast({
        title: "Finishing settlement",
        description: "Completing the queued private trade now.",
      });
      await settlePendingTrade();
      await refreshBalances();
      await checkPending();
      if (tab === "positions") {
        await loadPositions();
      }
      toast({
        title: "Settlement complete",
        description: "Your trade and private balance are now up to date.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Settle failed",
        description: "Unable to finish the pending encrypted trade.",
        variant: "destructive",
      });
    } finally {
      setTxPending(false);
      setDecrypting(false);
    }
  }

  async function handleClaimPayout(position: PositionView) {
    if (!signer || !address) return;
    const market = markets.find((item) => item.id.toString() === position.marketId);
    if (!market) return;

    try {
      setClaimingMarketId(position.marketId);
      toast({
        title: "Claiming payout",
        description: "Decrypting your winning position and crediting your private balance.",
      });
      const contract = contractWrite(signer);
      await (await contract.preparePayout(market.id)).wait();

      const shareHandle = market.outcome
        ? await contract.getYesSharesHandle(market.id, address)
        : await contract.getNoSharesHandle(market.id, address);

      const { abiEncodedClearValues, decryptionProof } = await publicDecryptHandles([shareHandle]);
      const receipt = await (
        await contract.claimPayout(market.id, abiEncodedClearValues, decryptionProof)
      ).wait();

      let credited = 0;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed?.name === "PayoutClaimed") {
            credited = fromUsdcUnits(parsed.args.usdcAmount);
          }
        } catch {
          // ignore unrelated logs
        }
      }

      toast({
        title: "Payout claimed",
        description: `Encrypted balance credited with ${credited.toFixed(2)} USDC.`,
      });
      await refreshBalances();
      await loadPositions();
    } catch (error) {
      console.error(error);
      toast({
        title: "Claim failed",
        description: "Unable to claim the winning payout.",
        variant: "destructive",
      });
    } finally {
      setClaimingMarketId(null);
    }
  }

  async function handleRefreshPrivateState() {
    await refreshBalances();
    if (tab === "positions") {
      await loadPositions();
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="background-orbit background-orbit-one" />
      <div className="background-orbit background-orbit-two" />
      <Navbar
        role="trader"
        connected={Boolean(address)}
        onConnect={handleConnect}
        address={address ?? undefined}
        networkLabel={NETWORK.isLocal ? "Local test mode" : "Sepolia ready"}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-6 md:px-6">
        <div className="space-y-6">
          <div className="protocol-header">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="protocol-kicker">Trader cockpit</p>
                <h2 className="protocol-title">Private order flow for conviction-first trading.</h2>
                <p className="protocol-copy">
                  Fund the vault, route encrypted size, and refresh private state only when you choose to decrypt it.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="signal-chip">
                  <span className="signal-dot" />
                  Private AMM
                </div>
                <div className="signal-chip">Sponsor-blind sizing</div>
              </div>
            </div>
          </div>

          {hasPending && (
            <div className="market-panel border-[#f0ad4e] bg-[#fff6db]">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">Pending encrypted settlement</p>
              <p className="text-sm text-muted-foreground">
                You have a queued order waiting for public decryption and on-chain settlement.
              </p>
              <div className="flex items-center gap-3">
                <button onClick={handleSettlePending} className="signal-button px-4 py-3 text-sm">
                  Finish Settlement
                </button>
                {txPending && <PendingBadge />}
              </div>
            </div>
          )}

      {tradeBreakdown && (
        <div className="market-panel bg-[linear-gradient(180deg,rgba(216,243,220,0.96),rgba(255,255,255,0.96))]">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">Order complete</p>
          <p className="text-lg font-bold text-foreground">
            Submitted a {tradeBreakdown.side} trade for {tradeBreakdown.amount.toFixed(2)} USDC.
          </p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="protocol-sidebar xl:sticky xl:top-24 xl:self-start">
          <div className="space-y-4">
            <div className="protocol-sidebar-card">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Wallet USDC</p>
              <p className="mt-3 text-4xl font-black text-foreground">
                {loadingBalances || walletUsdc === null ? "..." : walletUsdc.toFixed(2)}
              </p>
            </div>
            <div className="protocol-sidebar-card">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Encrypted balance</p>
              <p className="mt-3 text-4xl font-black text-foreground">
                {decrypting ? "..." : encBalance !== null ? encBalance.toFixed(2) : "..."}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Local snapshot until you manually refresh private state.</p>
            </div>
            <div className="protocol-sidebar-card">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl border-2 border-black bg-secondary text-black">
                  <ArrowDownToLine size={16} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Fund Vault</p>
                  <p className="text-xs text-muted-foreground">Deposit public USDC into private balance.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3">
                <input
                  type="number"
                  min="1"
                  value={depositInput}
                  onChange={(event) => setDepositInput(event.target.value)}
                  className="rounded-[18px] border-2 border-black bg-white px-4 py-3 text-sm font-semibold text-foreground outline-none"
                  placeholder="100"
                />
                <button onClick={() => depositInput && handleDeposit(Number(depositInput))} className="signal-button px-4 py-3 text-sm">
                  Deposit
                </button>
                {NETWORK.isLocal && (
                  <button onClick={handleMintLocalUsdc} className="signal-button signal-button-muted px-4 py-3 text-sm">
                    Mint 500 Test USDC
                  </button>
                )}
              </div>
            </div>
            <div className="protocol-sidebar-card">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl border-2 border-black bg-white text-black">
                    <RefreshCcw size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Private Sync</p>
                    <p className="text-xs text-muted-foreground">Refresh balances and positions when needed.</p>
                  </div>
                </div>
                <button onClick={() => void handleRefreshPrivateState()} className="micro-button">
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setTab("markets")} className={`pill-tab ${tab === "markets" ? "pill-tab-active" : ""}`}>
                Browse Markets
              </button>
              <button onClick={() => setTab("positions")} className={`pill-tab ${tab === "positions" ? "pill-tab-active" : ""}`}>
                My Positions
              </button>
            </div>
            <div className="signal-chip">
              <Vault size={14} />
              Manual decrypt controls
            </div>
          </div>

      {tab === "markets" && (
        <div className="grid gap-5">
          {loadingMarkets
            ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="market-panel h-52 animate-pulse" />)
            : markets.map((market) => (
                <TraderMarketCard
                  key={market.id.toString()}
                  market={{
                    id: market.id.toString(),
                    question: market.question,
                    resolutionDate: new Date(market.resolutionDate * 1000).toISOString().slice(0, 10),
                    liquidityCap: Number(fromUsdcUnits(market.liquidityCap)),
                    yesPercentage: 50,
                    totalTrades: 0,
                    status: market.resolved ? "resolved" : "open",
                    createdBy: "",
                  }}
                  onTrade={() => setTradingMarket(market)}
                />
              ))}
        </div>
      )}

      {tab === "positions" && (
        <div className="grid gap-5">
          <div className="flex items-center justify-between gap-3 rounded-[24px] border border-black/10 bg-white/70 px-4 py-3">
            <p className="text-sm text-muted-foreground">Local cache shown first. Refresh only when you want a fresh decrypt.</p>
            <button onClick={() => void loadPositions()} className="micro-button">
              <RefreshCcw size={14} />
              Refresh positions
            </button>
          </div>
          {loadingPositions && <div className="market-panel">Decrypting your positions...</div>}
          {!loadingPositions && positions.length === 0 && (
            <div className="market-panel">
              <p>No encrypted positions cached yet. Trade a market or refresh private state to load them.</p>
            </div>
          )}
          {!loadingPositions &&
            positions.map((position) => (
              <PositionCard
                key={`${position.marketId}-${position.side}`}
                position={position}
                claiming={claimingMarketId === position.marketId}
                onClaim={position.status === "resolved" && position.outcome === position.side ? () => handleClaimPayout(position) : undefined}
              />
            ))}
        </div>
      )}
        </section>
      </div>

          <TradeModal
            market={
              tradingMarket
                ? {
                    id: tradingMarket.id.toString(),
                    question: tradingMarket.question,
                    resolutionDate: new Date(tradingMarket.resolutionDate * 1000).toISOString().slice(0, 10),
                    liquidityCap: Number(fromUsdcUnits(tradingMarket.liquidityCap)),
                    yesPercentage: 50,
                    totalTrades: 0,
                    status: tradingMarket.resolved ? "resolved" : "open",
                    createdBy: "",
                  }
                : null
            }
            onClose={() => setTradingMarket(null)}
            onSubmit={tradingMarket ? (side, amount) => handleTradeSubmit(tradingMarket, side, amount) : undefined}
          />
        </div>
      </main>
    </div>
  );
};

export default TraderView;
