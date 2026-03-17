import { useEffect, useMemo, useState } from "react";
import { Calendar, Eye, ShieldCheck } from "lucide-react";
import SentimentBar from "./SentimentBar";
import PendingBadge from "./PendingBadge";
import { contractRead, contractWrite } from "@/lib/contract";
import { fromUsdcUnits, userDecryptHandle } from "@/lib/fhe";
import { useToast } from "@/components/ui/use-toast";
import { ethers } from "ethers";

interface Props {
  market: {
    id: bigint;
    question: string;
    resolutionDate: number;
    resolved: boolean;
    outcome: boolean;
    liquidityCap: bigint;
    totalEscrowed: bigint;
  };
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address: string | null;
  sponsorStorageKey: string | null;
  onResolved?: () => void;
}

type SponsorCacheEntry = {
  yesPool: string;
  noPool: string;
  totalYesShares: string;
  totalNoShares: string;
  yesPercentage: number;
};

const SponsorMarketCard = ({ market, provider, signer, address, sponsorStorageKey, onResolved }: Props) => {
  const [resolving, setResolving] = useState<"YES" | "NO" | null>(null);
  const [viewing, setViewing] = useState(false);
  const [yesPool, setYesPool] = useState<bigint | null>(null);
  const [noPool, setNoPool] = useState<bigint | null>(null);
  const [totalYesShares, setTotalYesShares] = useState<bigint | null>(null);
  const [totalNoShares, setTotalNoShares] = useState<bigint | null>(null);
  const [yesPercentage, setYesPercentage] = useState(50);
  const { toast } = useToast();

  const readContract = provider ? contractRead(provider) : null;
  const isPastResolution = new Date(market.resolutionDate * 1000) <= new Date();
  const formatScaledValue = (value: bigint | null) => (value !== null ? fromUsdcUnits(value).toFixed(2) : "Cached only");
  const marketCacheKey = useMemo(
    () => (sponsorStorageKey ? `${sponsorStorageKey}:market:${market.id.toString()}` : null),
    [market.id, sponsorStorageKey],
  );

  useEffect(() => {
    if (!marketCacheKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(marketCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SponsorCacheEntry;
      setYesPool(BigInt(parsed.yesPool));
      setNoPool(BigInt(parsed.noPool));
      setTotalYesShares(BigInt(parsed.totalYesShares));
      setTotalNoShares(BigInt(parsed.totalNoShares));
      setYesPercentage(parsed.yesPercentage);
    } catch (error) {
      console.error(error);
    }
  }, [marketCacheKey]);

  function updateSponsorCache(
    nextYes: bigint,
    nextNo: bigint,
    nextTotalYesShares: bigint,
    nextTotalNoShares: bigint,
    nextYesPercentage: number,
  ) {
    if (!marketCacheKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        marketCacheKey,
        JSON.stringify({
          yesPool: nextYes.toString(),
          noPool: nextNo.toString(),
          totalYesShares: nextTotalYesShares.toString(),
          totalNoShares: nextTotalNoShares.toString(),
          yesPercentage: nextYesPercentage,
        } satisfies SponsorCacheEntry),
      );
    } catch (error) {
      console.error(error);
    }
  }

  async function refreshPools() {
    if (!readContract || !signer || !address) return;

    const nextYesHandle = await readContract.getYesPoolHandle(market.id);
    const nextNoHandle = await readContract.getNoPoolHandle(market.id);
    const nextTotalYesHandle = await readContract.getTotalYesSharesHandle(market.id);
    const nextTotalNoHandle = await readContract.getTotalNoSharesHandle(market.id);
    const nextYes = nextYesHandle && nextYesHandle !== ethers.ZeroHash ? await userDecryptHandle(nextYesHandle, signer) : 0n;
    const nextNo = nextNoHandle && nextNoHandle !== ethers.ZeroHash ? await userDecryptHandle(nextNoHandle, signer) : 0n;
    const nextTotalYes =
      nextTotalYesHandle && nextTotalYesHandle !== ethers.ZeroHash ? await userDecryptHandle(nextTotalYesHandle, signer) : 0n;
    const nextTotalNo =
      nextTotalNoHandle && nextTotalNoHandle !== ethers.ZeroHash ? await userDecryptHandle(nextTotalNoHandle, signer) : 0n;

    setYesPool(nextYes);
    setNoPool(nextNo);
    setTotalYesShares(nextTotalYes);
    setTotalNoShares(nextTotalNo);

    const total = nextYes + nextNo;
    if (total > 0n) {
      const nextYesPercentage = Number((nextNo * 100n) / total);
      setYesPercentage(nextYesPercentage);
      updateSponsorCache(nextYes, nextNo, nextTotalYes, nextTotalNo, nextYesPercentage);
    }
  }

  async function handleViewPools() {
    if (!signer) return;
    const progress = toast({
      title: "Refreshing sponsor view",
      description: "Decrypting the latest pool movement for this market.",
    });
    try {
      setViewing(true);
      const contract = contractWrite(signer);
      await (await contract.requestSponsorView(market.id)).wait();
      await refreshPools();
      progress.update({
        title: "Sponsor view updated",
        description: "The latest encrypted pool movement has been cached in this browser.",
      });
    } catch (error) {
      console.error(error);
      progress.update({
        title: "View failed",
        description: "Unable to decrypt sponsor pool movement.",
        variant: "destructive",
      });
    } finally {
      setViewing(false);
    }
  }

  async function handleResolve(side: "YES" | "NO") {
    if (!signer) return;
    const progress = toast({
      title: `Resolving ${side}`,
      description: "Submitting the sponsor resolution transaction.",
    });
    try {
      setResolving(side);
      const contract = contractWrite(signer);
      const winningShares = side === "YES" ? totalYesShares ?? 0n : totalNoShares ?? 0n;
      await (await contract.resolveMarket(market.id, side === "YES", winningShares)).wait();
      onResolved?.();
      progress.update({
        title: "Market resolved",
        description: `${side} was submitted as the market outcome.`,
      });
    } catch (error) {
      console.error(error);
      progress.update({
        title: "Resolve failed",
        description: "Unable to resolve market.",
        variant: "destructive",
      });
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="market-panel">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            <ShieldCheck size={12} />
            Sponsor Lens
          </div>
          <h3 className="text-xl font-black leading-tight text-foreground">{market.question}</h3>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${market.resolved ? "bg-black text-white" : "bg-white text-black border border-black/10"}`}>
            {market.resolved ? "Resolved" : "Open"}
          </div>
          {market.resolved && (
            <div className="rounded-full bg-black px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-white">
              {market.outcome ? "YES WON" : "NO WON"}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Resolution</p>
          <p className="mt-2 flex items-center gap-2 font-semibold text-foreground">
            <Calendar size={14} />
            {new Date(market.resolutionDate * 1000).toISOString().slice(0, 10)}
          </p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Cap</p>
          <p className="mt-2 font-semibold text-foreground">${fromUsdcUnits(market.liquidityCap).toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Escrow</p>
          <p className="mt-2 font-semibold text-foreground">${fromUsdcUnits(market.totalEscrowed).toFixed(2)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Seeded market collateral</p>
        </div>
      </div>

      <div className="rounded-[26px] border border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(241,239,255,0.85))] p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Encrypted pool movement</p>
            <p className="mt-1 text-sm text-muted-foreground">Only the sponsor wallet can decrypt this directional pressure. Cached locally after refresh.</p>
          </div>
          <button onClick={handleViewPools} className="signal-button inline-flex items-center gap-2 px-4 py-3 text-sm">
            <Eye size={14} />
            {viewing ? "Refreshing" : "Reveal Flow"}
          </button>
        </div>
        <SentimentBar yesPercentage={yesPercentage} />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-black/10 bg-white/80 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">YES Pool</p>
            <p className="mt-2 text-lg font-bold text-foreground">{formatScaledValue(yesPool)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">NO Pool</p>
            <p className="mt-2 text-lg font-bold text-foreground">{formatScaledValue(noPool)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Total YES Shares</p>
            <p className="mt-2 text-lg font-bold text-foreground">{formatScaledValue(totalYesShares)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white/80 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Total NO Shares</p>
            <p className="mt-2 text-lg font-bold text-foreground">{formatScaledValue(totalNoShares)}</p>
          </div>
        </div>
      </div>

      {!market.resolved && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleResolve("YES")}
            className="signal-button px-4 py-3 text-sm"
            disabled={Boolean(resolving) || !isPastResolution}
          >
            Resolve YES
          </button>
          <button
            onClick={() => handleResolve("NO")}
            className="signal-button signal-button-muted px-4 py-3 text-sm"
            disabled={Boolean(resolving) || !isPastResolution}
          >
            Resolve NO
          </button>
          {resolving && <PendingBadge />}
          {!isPastResolution && (
            <p className="text-xs font-semibold text-muted-foreground">
              Resolve becomes executable after {new Date(market.resolutionDate * 1000).toISOString().slice(0, 10)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SponsorMarketCard;
