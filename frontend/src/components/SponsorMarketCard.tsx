import { useEffect, useState } from "react";
import { Lock, Calendar, TrendingUp } from "lucide-react";
import SentimentBar from "./SentimentBar";
import PendingBadge from "./PendingBadge";
import { contractRead, contractWrite } from "@/lib/contract";
import { userDecryptHandle } from "@/lib/fhe";
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
}

const SponsorMarketCard = ({ market, provider, signer, address }: Props) => {
  const [resolving, setResolving] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [yesPool, setYesPool] = useState<bigint | null>(null);
  const [noPool, setNoPool] = useState<bigint | null>(null);
  const [yesPercentage, setYesPercentage] = useState<number>(50);
  const [watchPools, setWatchPools] = useState(false);
  const { toast } = useToast();

  const isPastResolution = new Date(market.resolutionDate * 1000) <= new Date();

  const readContract = provider ? contractRead(provider) : contractRead(ethers.getDefaultProvider());

  useEffect(() => {
    if (!watchPools) return;
    const id = setInterval(() => {
      void refreshPools();
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchPools, signer, address]);

  async function refreshPools() {
    if (!signer || !address) return;
    try {
      const yesHandle = await readContract.getYesPoolHandle(market.id);
      const noHandle = await readContract.getNoPoolHandle(market.id);

      if (yesHandle && yesHandle !== ethers.ZeroHash) {
        const y = await userDecryptHandle(yesHandle, signer);
        setYesPool(y);
      }
      if (noHandle && noHandle !== ethers.ZeroHash) {
        const n = await userDecryptHandle(noHandle, signer);
        setNoPool(n);
      }

      const yVal = yesPool ?? 0n;
      const nVal = noPool ?? 0n;
      const total = yVal + nVal;
      if (total > 0n) {
        const pct = Number((yVal * 100n) / total);
        setYesPercentage(pct);
      }
    } catch (e) {
      console.error(e);
      toast({
        title: "Decrypt failed",
        description: "Could not refresh encrypted pool",
        variant: "destructive",
      });
    }
  }

  async function handleViewPools() {
    if (!signer || !address) return;
    try {
      setViewing(true);
      const write = contractWrite(signer);
      const tx = await write.requestSponsorView(market.id);
      await tx.wait();
      await refreshPools();
      setWatchPools(true);
    } catch (e) {
      console.error(e);
      toast({
        title: "View failed",
        description: "Unable to request sponsor view",
        variant: "destructive",
      });
    } finally {
      setViewing(false);
    }
  }

  const handleResolve = () => {
    if (!signer) return;
    const resolve = async (outcome: boolean) => {
      try {
        setResolving(true);
        const write = contractWrite(signer);
        const winning = outcome ? (yesPool ?? 0n) : (noPool ?? 0n);
        const tx = await write.resolveMarket(market.id, outcome, winning);
        await tx.wait();
      } catch (e) {
        console.error(e);
        toast({
          title: "Resolve failed",
          description: "Could not resolve market",
          variant: "destructive",
        });
      } finally {
        setResolving(false);
      }
    };
    void resolve(true);
  };

  return (
    <div className="brutal-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold leading-tight flex-1">
          {market.question}
        </h3>
        {market.resolved && (
          <span className="brutal-btn bg-mint text-foreground px-3 py-1 text-xs">
            {market.outcome ? "YES" : "NO"}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1">
          <Calendar size={14} />
          {new Date(market.resolutionDate * 1000).toISOString().slice(0, 10)}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Lock size={14} />
          Cap: ${Number(market.liquidityCap).toLocaleString()}
        </span>
      </div>

      {/* Encrypted sentiment - sponsor only */}
      <div className="bg-lavender p-3 border-[3px] border-foreground rounded-xl">
        <p className="text-xs font-bold mb-2 flex items-center gap-1">
          <Lock size={12} /> ENCRYPTED POOL MOVEMENT (SPONSOR ONLY)
        </p>
        <SentimentBar yesPercentage={yesPercentage} />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            onClick={handleViewPools}
            className="brutal-btn bg-card text-foreground px-3 py-1 text-xs"
          >
            {viewing ? "DECRYPTING..." : "View Pool Movement"}
          </button>
          {viewing && <PendingBadge />}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm font-bold">
          <TrendingUp size={14} />
          <Lock size={12} /> Encrypted trades
        </span>

        {resolving && <PendingBadge />}

        {isPastResolution && market.status === "open" && !resolving && (
          <button
            onClick={handleResolve}
            className="brutal-btn bg-destructive text-destructive-foreground px-4 py-2 text-sm"
          >
            Resolve Market
          </button>
        )}
      </div>
    </div>
  );
};

export default SponsorMarketCard;
