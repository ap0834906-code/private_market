import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import PendingBadge from "./PendingBadge";
import { contractWrite, createUsdcContract, PRIVATE_MARKET_ADDRESS } from "@/lib/contract";
import { toUsdcUnits } from "@/lib/fhe";
import { useToast } from "@/components/ui/use-toast";
import type { ethers } from "ethers";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  signer: ethers.Signer | null;
}

const CreateMarketModal = ({ open, onClose, onCreated, signer }: Props) => {
  const [question, setQuestion] = useState("");
  const [date, setDate] = useState("");
  const [cap, setCap] = useState("");
  const [initialLiquidity, setInitialLiquidity] = useState("");
  const [seedLiquidity, setSeedLiquidity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!signer) {
      toast({
        title: "Wallet not connected",
        description: "Connect as sponsor to create markets.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);
      const resolutionTs = Math.floor(new Date(date).getTime() / 1000);
      const liquidityCap = toUsdcUnits(Number(cap));
      const initialLiq = toUsdcUnits(Number(initialLiquidity || "0"));
      const seedLiq = toUsdcUnits(Number(seedLiquidity || "0"));

      const usdc = createUsdcContract(signer);
      await (await usdc.approve(PRIVATE_MARKET_ADDRESS, seedLiq)).wait();

      const contract = contractWrite(signer);
      await (await contract.createMarket(question, resolutionTs, liquidityCap, initialLiq, seedLiq)).wait();

      toast({
        title: "Market created",
        description: "Your encrypted market is now live.",
      });

      onCreated?.();
      onClose();
      setQuestion("");
      setDate("");
      setCap("");
      setInitialLiquidity("");
      setSeedLiquidity("");
    } catch (error) {
      console.error(error);
      toast({
        title: "Create failed",
        description: "Unable to create market.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[32px] border-2 border-black bg-[linear-gradient(180deg,rgba(255,248,237,0.98),rgba(255,255,255,0.98))] p-6 shadow-[10px_10px_0_0_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">Sponsor console</p>
            <h2 className="mt-2 text-3xl font-black text-foreground">Launch a new encrypted market</h2>
          </div>
          <button onClick={onClose} className="rounded-2xl border-2 border-black bg-white p-2">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Question</label>
            <input
              required
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="mt-2 w-full rounded-[22px] border-2 border-black bg-white px-4 py-4 text-base font-semibold text-foreground outline-none"
              placeholder="Will ETH close above $5,000 before January 1, 2027?"
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Resolution date</label>
            <input
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-2 w-full rounded-[22px] border-2 border-black bg-white px-4 py-4 text-base font-semibold text-foreground outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Liquidity cap (USDC)</label>
            <input
              type="number"
              required
              value={cap}
              onChange={(event) => setCap(event.target.value)}
              className="mt-2 w-full rounded-[22px] border-2 border-black bg-white px-4 py-4 text-base font-semibold text-foreground outline-none"
              placeholder="250000"
            />
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Initial liquidity</label>
            <input
              type="number"
              required
              value={initialLiquidity}
              onChange={(event) => setInitialLiquidity(event.target.value)}
              className="mt-2 w-full rounded-[22px] border-2 border-black bg-white px-4 py-4 text-base font-semibold text-foreground outline-none"
              placeholder="100"
            />
            <p className="mt-2 text-xs text-muted-foreground">Enter a normal value like `100`. The app scales it automatically.</p>
          </div>
          <div>
            <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Seed liquidity (USDC)</label>
            <input
              type="number"
              required
              value={seedLiquidity}
              onChange={(event) => setSeedLiquidity(event.target.value)}
              className="mt-2 w-full rounded-[22px] border-2 border-black bg-white px-4 py-4 text-base font-semibold text-foreground outline-none"
              placeholder="6"
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between gap-4 rounded-[24px] border border-black/10 bg-white/70 p-4">
            <p className="text-sm text-muted-foreground">
              Seed liquidity gets escrowed into the market at creation time. For Sepolia, fund your sponsor wallet with test USDC first.
            </p>
            <button type="submit" disabled={submitting} className="signal-button inline-flex items-center gap-2 px-5 py-4 text-sm">
              <Sparkles size={14} />
              {submitting ? "Launching" : "Launch Market"}
            </button>
            {submitting && <PendingBadge />}
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateMarketModal;
