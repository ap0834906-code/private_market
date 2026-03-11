import { useState } from "react";
import { X } from "lucide-react";
import PendingBadge from "./PendingBadge";
import { contractWrite, createUsdcContract, PRIVATE_MARKET_ADDRESS } from "@/lib/contract";
import { toUsdcUnits } from "@/lib/fhe";
import { useToast } from "@/components/ui/use-toast";
import type { ethers } from "ethers";

interface Props {
  open: boolean;
  onClose: () => void;
  signer: ethers.Signer | null;
}

const CreateMarketModal = ({ open, onClose, signer }: Props) => {
  const [question, setQuestion] = useState("");
  const [date, setDate] = useState("");
  const [cap, setCap] = useState("");
  const [initialLiquidity, setInitialLiquidity] = useState("");
  const [seedLiquidity, setSeedLiquidity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signer) {
      toast({
        title: "Wallet not connected",
        description: "Connect as sponsor to create markets",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const resolutionTs = Math.floor(new Date(date).getTime() / 1000);
      const liquidityCap = toUsdcUnits(Number(cap));
      const initialLiq = BigInt(Math.floor(Number(initialLiquidity || "0")));
      const seedLiq = toUsdcUnits(Number(seedLiquidity || "0"));

      const usdc = createUsdcContract(signer);
      const approveTx = await usdc.approve(PRIVATE_MARKET_ADDRESS, seedLiq);
      await approveTx.wait();

      const c = contractWrite(signer);
      const tx = await c.createMarket(
        question,
        resolutionTs,
        liquidityCap,
        initialLiq,
        seedLiq,
      );
      await tx.wait();
      toast({
        title: "Market created",
        description: "Your encrypted market is now live",
      });
      onClose();
      setQuestion("");
      setDate("");
      setCap("");
      setInitialLiquidity("");
      setSeedLiquidity("");
    } catch (err) {
      console.error(err);
      toast({
        title: "Create failed",
        description: "Unable to create market",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
      <div className="brutal-card bg-card p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Create Market</h2>
          <button onClick={onClose} className="brutal-btn bg-card p-2">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-sm font-bold uppercase mb-1 block">Question</label>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              className="w-full p-3 border-[3px] border-foreground bg-card text-foreground font-sans text-base rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Will X happen by Y?"
              required
            />
          </div>

          <div>
            <label className="text-sm font-bold uppercase mb-1 block">Resolution Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full p-3 border-[3px] border-foreground bg-card text-foreground font-sans text-base rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="text-sm font-bold uppercase mb-1 block">Liquidity Cap ($)</label>
            <input
              type="number"
              value={cap}
              onChange={e => setCap(e.target.value)}
              className="w-full p-3 border-[3px] border-foreground bg-card text-foreground font-sans text-base rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="50000"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-bold uppercase mb-1 block">Initial Liquidity (shares)</label>
              <input
                type="number"
                value={initialLiquidity}
                onChange={e => setInitialLiquidity(e.target.value)}
                className="w-full p-3 border-[3px] border-foreground bg-card text-foreground font-sans text-base rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="1000"
                required
              />
            </div>
            <div>
              <label className="text-sm font-bold uppercase mb-1 block">Seed Liquidity (USDC)</label>
              <input
                type="number"
                value={seedLiquidity}
                onChange={e => setSeedLiquidity(e.target.value)}
                className="w-full p-3 border-[3px] border-foreground bg-card text-foreground font-sans text-base rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="50000"
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-2">
            <button
              type="submit"
              disabled={submitting}
              className="brutal-btn bg-primary text-primary-foreground px-6 py-3 text-base flex-1"
            >
              {submitting ? "DEPLOYING..." : "DEPLOY MARKET"}
            </button>
            {submitting && <PendingBadge />}
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateMarketModal;
