import { useEffect, useMemo, useState } from "react";
import TraderMarketCard from "@/components/TraderMarketCard";
import PositionCard, { type PositionView } from "@/components/PositionCard";
import TradeModal from "@/components/TradeModal";
import PendingBadge from "@/components/PendingBadge";
import { contractRead, contractWrite, createUsdcContract, PRIVATE_MARKET_ADDRESS } from "@/lib/contract";
import { fromUsdcUnits, toUsdcUnits, userDecryptHandle, publicDecryptHandles, getRelayerInstance } from "@/lib/fhe";
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
  const [tradeBreakdown, setTradeBreakdown] = useState<{ side: "YES" | "NO"; amount: number; shares: number } | null>(null);
  const [depositInput, setDepositInput] = useState("");
  const [withdrawInput, setWithdrawInput] = useState("");
  const [hasPending, setHasPending] = useState(false);
  const [positions, setPositions] = useState<PositionView[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [claimingMarketId, setClaimingMarketId] = useState<string | null>(null);

  useEffect(() => {
    if ((window as any).ethereum && !provider) {
      const p = new ethers.BrowserProvider((window as any).ethereum as any);
      setProvider(p);
      p.getSigner().then(s => {
        setSigner(s);
        s.getAddress().then(a => setAddress(a));
      }).catch(() => {});
    }
  }, [provider]);

  const readContract = useMemo(
    () => (provider ? contractRead(provider) : contractRead(ethers.getDefaultProvider())),
    [provider],
  );

  useEffect(() => {
    if (!address || !provider || !signer) return;
    void refreshBalances();
    void loadMarkets();
    void checkPending();
  }, [address, provider, signer]);

  async function refreshBalances() {
    if (!provider || !signer || !address) return;
    setLoadingBalances(true);
    try {
      const usdc = createUsdcContract(provider);
      const raw = await usdc.balanceOf(address);
      setWalletUsdc(fromUsdcUnits(raw));

      const handle = await readContract.getEncBalanceHandle(address);
      if (handle && handle !== ethers.ZeroHash) {
        setDecrypting(true);
        const value = await userDecryptHandle(handle, signer, PRIVATE_MARKET_ADDRESS);
        setEncBalance(fromUsdcUnits(value));
      } else {
        setEncBalance(0);
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "Failed to load balances",
        variant: "destructive",
      });
    } finally {
      setLoadingBalances(false);
      setDecrypting(false);
    }
  }

  async function loadMarkets() {
    setLoadingMarkets(true);
    try {
      const count: bigint = await readContract.marketCount();
      const list: OnchainMarket[] = [];
      for (let i = 0n; i < count; i++) {
        const m = await readContract.getMarket(i);
        list.push({
          id: i,
          question: m[1],
          resolutionDate: Number(m[2]),
          resolved: Boolean(m[3]),
          outcome: Boolean(m[4]),
          liquidityCap: m[5],
        });
      }
      setMarkets(list);
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "Failed to load markets",
        variant: "destructive",
      });
    } finally {
      setLoadingMarkets(false);
    }
  }

  async function checkPending() {
    if (!address) return;
    try {
      const p: boolean = await readContract.hasPendingTrade(address);
      setHasPending(Boolean(p));
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDeposit(amount: number) {
    if (!signer || !address) return;
    try {
      setTxPending(true);
      const usdc = createUsdcContract(signer);
      const pmAmount = toUsdcUnits(amount);
      const allowance: bigint = await usdc.allowance(address, PRIVATE_MARKET_ADDRESS);
      if (allowance < pmAmount) {
        const approveTx = await usdc.approve(PRIVATE_MARKET_ADDRESS, pmAmount);
        await approveTx.wait();
      }
      const c = contractWrite(signer);
      const tx = await c.deposit(pmAmount);
      await tx.wait();
      await refreshBalances();
    } catch (e) {
      console.error(e);
      toast({
        title: "Transaction failed",
        description: "Deposit failed",
        variant: "destructive",
      });
    } finally {
      setTxPending(false);
    }
  }

  async function handleWithdraw(amount: number) {
    if (!signer) return;
    try {
      setTxPending(true);
      const c = contractWrite(signer);
      const tx = await c.withdraw(toUsdcUnits(amount));
      await tx.wait();
      await refreshBalances();
    } catch (e) {
      console.error(e);
      toast({
        title: "Transaction failed",
        description: "Withdraw failed",
        variant: "destructive",
      });
    } finally {
      setTxPending(false);
    }
  }

  async function handleTradeSubmit(market: OnchainMarket, side: "YES" | "NO", amount: number) {
    if (!signer || !address) return;
    try {
      setTxPending(true);
      setDecrypting(true);
      const instanceAmount = toUsdcUnits(amount);

      const instance = await getRelayerInstance();
      const input = await instance.createEncryptedInput(PRIVATE_MARKET_ADDRESS, address);
      input.add64(instanceAmount);
      const enc = await input.encrypt();

      const c = contractWrite(signer);
      const tx = await c.trade(market.id, side === "YES", enc.handles[0], enc.inputProof);
      await tx.wait();

      const settleTx = await c.requestSettlementProof();
      await settleTx.wait();

      const handle = await c.getPendingLowerHandle(address);
      const { abiEncodedClearValues, decryptionProof, clearValues } = await publicDecryptHandles([
        handle,
      ]);
      const plaintextLower = clearValues[handle] ?? 0n;

      const settle = await c.settleTrade(
        plaintextLower,
        abiEncodedClearValues,
        decryptionProof,
      );
      const receipt = await settle.wait();

      let shares = 0;
      let cost = amount;
      for (const log of receipt.logs) {
        try {
          const parsed = c.interface.parseLog(log);
          if (parsed?.name === "TradeSettled") {
            shares = Number(parsed.args.shares);
            cost = fromUsdcUnits(parsed.args.cost);
          }
        } catch {
          // ignore non-matching logs
        }
      }

      setTradeBreakdown({
        side,
        amount: cost,
        shares,
      });
      await refreshBalances();
      await checkPending();
    } catch (e) {
      console.error(e);
      toast({
        title: "Trade failed",
        description: "Check console for full relayer error",
        variant: "destructive",
      });
    } finally {
      setTxPending(false);
      setDecrypting(false);
    }
  }

  async function handleSettlePending() {
    if (!signer || !address) return;
    try {
      setTxPending(true);
      setDecrypting(true);
      const c = contractWrite(signer);
      const settleTx = await c.requestSettlementProof();
      await settleTx.wait();

      const handle = await c.getPendingLowerHandle(address);
      const { abiEncodedClearValues, decryptionProof, clearValues } = await publicDecryptHandles([
        handle,
      ]);
      const plaintextLower = clearValues[handle] ?? 0n;

      const settle = await c.settleTrade(
        plaintextLower,
        abiEncodedClearValues,
        decryptionProof,
      );
      await settle.wait();
      await refreshBalances();
      await checkPending();
    } catch (e) {
      console.error(e);
      toast({
        title: "Settle failed",
        description: "Could not settle pending trade",
        variant: "destructive",
      });
    } finally {
      setTxPending(false);
      setDecrypting(false);
    }
  }

  async function loadPositions() {
    if (!signer || !address) return;
    setLoadingPositions(true);
    try {
      const next: PositionView[] = [];
      for (const m of markets) {
        const yesHandle = await readContract.getYesSharesHandle(m.id, address);
        const noHandle = await readContract.getNoSharesHandle(m.id, address);

        if (yesHandle && yesHandle !== ethers.ZeroHash) {
          const sharesBig = await userDecryptHandle(yesHandle, signer, PRIVATE_MARKET_ADDRESS);
          const shares = Number(sharesBig);
          if (shares > 0) {
            next.push({
              marketId: m.id.toString(),
              question: m.question,
              side: "YES",
              shares,
              avgPrice: 1,
              status: m.resolved ? "resolved" : "open",
              outcome: m.resolved ? (m.outcome ? "YES" : "NO") : undefined,
            });
          }
        }

        if (noHandle && noHandle !== ethers.ZeroHash) {
          const sharesBig = await userDecryptHandle(noHandle, signer, PRIVATE_MARKET_ADDRESS);
          const shares = Number(sharesBig);
          if (shares > 0) {
            next.push({
              marketId: m.id.toString(),
              question: m.question,
              side: "NO",
              shares,
              avgPrice: 1,
              status: m.resolved ? "resolved" : "open",
              outcome: m.resolved ? (m.outcome ? "YES" : "NO") : undefined,
            });
          }
        }
      }
      setPositions(next);
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "Failed to load positions",
        variant: "destructive",
      });
    } finally {
      setLoadingPositions(false);
    }
  }

  async function handleClaimPayout(position: PositionView) {
    if (!signer || !address) return;
    const market = markets.find(m => m.id.toString() === position.marketId);
    if (!market) return;
    try {
      setClaimingMarketId(position.marketId);
      const c = contractWrite(signer);
      const prepTx = await c.preparePayout(market.id);
      await prepTx.wait();

      const winningIsYes = market.outcome;
      const handle = winningIsYes
        ? await c.getYesSharesHandle(market.id, address)
        : await c.getNoSharesHandle(market.id, address);

      const { abiEncodedClearValues, decryptionProof } = await publicDecryptHandles([handle]);

      const claimTx = await c.claimPayout(
        market.id,
        abiEncodedClearValues,
        decryptionProof,
      );
      const receipt = await claimTx.wait();

      let credited = 0;
      for (const log of receipt.logs) {
        try {
          const parsed = c.interface.parseLog(log);
          if (parsed?.name === "PayoutClaimed") {
            credited = fromUsdcUnits(parsed.args.usdcAmount);
          }
        } catch {
          // ignore
        }
      }

      toast({
        title: "Payout claimed",
        description: `Encrypted balance credited with ${credited.toFixed(2)} USDC`,
      });
      await refreshBalances();
      await loadPositions();
    } catch (e) {
      console.error(e);
      toast({
        title: "Claim failed",
        description: "Unable to claim payout",
        variant: "destructive",
      });
    } finally {
      setClaimingMarketId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-bold">Trader Dashboard</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Deposit USDC, trade encrypted markets, and claim payouts.
          </p>
        </div>
        <div className="brutal-card-sm p-3 text-xs md:text-sm flex flex-col gap-1 min-w-[220px]">
          <div className="flex justify-between">
            <span className="font-bold">Wallet USDC</span>
            <span>{loadingBalances || walletUsdc === null ? "—" : `${walletUsdc.toFixed(2)} USDC`}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="font-bold">Encrypted balance</span>
            <span>
              {decrypting && <span className="brutal-btn bg-foreground text-background px-2 py-0.5 text-[10px] -rotate-1">DECRYPTING...</span>}
              {!decrypting && (encBalance !== null ? `${encBalance.toFixed(2)} USDC` : "—")}
            </span>
          </div>
          {txPending && (
            <div className="mt-1">
              <PendingBadge />
            </div>
          )}
        </div>
      </div>

      {hasPending && (
        <div className="brutal-card bg-yellow-200 p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <p className="font-bold text-sm">
            You have a pending encrypted trade that needs settlement.
          </p>
          <button
            onClick={handleSettlePending}
            className="brutal-btn bg-foreground text-background px-4 py-2 text-xs md:text-sm"
          >
            Settle Pending Trade
          </button>
        </div>
      )}

      {tradeBreakdown && (
        <div className="brutal-card bg-mint/40 p-4 mb-6">
          <p className="font-bold">
            You bought {tradeBreakdown.shares} {tradeBreakdown.side} shares for{" "}
            {tradeBreakdown.amount.toFixed(2)} USDC
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-4 items-center mb-6">
        <div className="flex border-[3px] border-foreground w-fit rounded-xl overflow-hidden">
          <button
            onClick={() => setTab("markets")}
            className={`px-6 py-2 font-bold text-sm uppercase transition-colors ${
              tab === "markets" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
            }`}
          >
            Browse Markets
          </button>
          <button
            onClick={() => setTab("positions")}
            className={`px-6 py-2 font-bold text-sm uppercase border-l-[3px] border-foreground transition-colors ${
              tab === "positions" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
            }`}
          >
            My Positions
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="brutal-card-sm p-3 flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={depositInput}
              onChange={e => setDepositInput(e.target.value)}
              className="w-24 sm:w-28 p-1.5 border-[3px] border-foreground bg-card text-foreground text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="50"
            />
            <button
              className="brutal-btn bg-primary text-primary-foreground px-3 py-1.5 text-xs"
              onClick={() => depositInput && handleDeposit(Number(depositInput))}
            >
              Deposit USDC
            </button>
          </div>
          <div className="brutal-card-sm p-3 flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={withdrawInput}
              onChange={e => setWithdrawInput(e.target.value)}
              className="w-24 sm:w-28 p-1.5 border-[3px] border-foreground bg-card text-foreground text-xs rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="20"
            />
            <button
              className="brutal-btn bg-card text-foreground px-3 py-1.5 text-xs"
              onClick={() => withdrawInput && handleWithdraw(Number(withdrawInput))}
            >
              Withdraw
            </button>
          </div>
        </div>
      </div>

      {tab === "markets" && (
        <div className="grid gap-5 md:grid-cols-2">
          {loadingMarkets
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="brutal-card p-5 animate-pulse h-40" />
              ))
            : markets.map(market => (
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
        <div className="grid gap-5 md:grid-cols-2">
          {loadingPositions && (
            <div className="text-sm text-muted-foreground">Decrypting your positions...</div>
          )}
          {!loadingPositions && positions.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No encrypted positions detected yet. Trade a market to open a position.
            </div>
          )}
          {!loadingPositions &&
            positions.map(pos => (
              <PositionCard
                key={`${pos.marketId}-${pos.side}`}
                position={pos}
                claiming={claimingMarketId === pos.marketId}
                onClaim={
                  pos.status === "resolved" && pos.outcome === pos.side
                    ? () => handleClaimPayout(pos)
                    : undefined
                }
              />
            ))}
        </div>
      )}

      <TradeModal
        market={
          tradingMarket
            ? {
                id: tradingMarket.id.toString(),
                question: tradingMarket.question,
                resolutionDate: new Date(tradingMarket.resolutionDate * 1000).toISOString().slice(
                  0,
                  10,
                ),
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
  );
};

export default TraderView;
