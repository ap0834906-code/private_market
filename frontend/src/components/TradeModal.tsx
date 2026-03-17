import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import PendingBadge from "./PendingBadge";
import type { Market } from "@/data/mockData";

interface Props {
  market: Market | null;
  onClose: () => void;
  onSubmit?: (side: "YES" | "NO", amount: number) => void;
}

const TradeModal = ({ market, onClose, onSubmit }: Props) => {
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!market) return null;

  const handleTrade = (event: React.FormEvent) => {
    event.preventDefault();
    if (!onSubmit) {
      onClose();
      return;
    }
    setSubmitting(true);
    onSubmit(side, Number(amount || "0"));
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[30px] border-2 border-black bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,245,237,0.97))] p-6 shadow-[10px_10px_0_0_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">Encrypted trade ticket</p>
            <h2 className="mt-2 text-2xl font-black text-foreground">{market.question}</h2>
          </div>
          <button onClick={onClose} className="rounded-2xl border-2 border-black bg-white p-2">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleTrade} className="mt-6 space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setSide("YES")}
              className={`rounded-[24px] border-2 border-black px-4 py-4 text-left ${
                side === "YES" ? "bg-[#d8f3dc]" : "bg-white"
              }`}
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Side</p>
              <p className="mt-2 text-xl font-black">YES</p>
            </button>
            <button
              type="button"
              onClick={() => setSide("NO")}
              className={`rounded-[24px] border-2 border-black px-4 py-4 text-left ${
                side === "NO" ? "bg-[#ffcad4]" : "bg-white"
              }`}
            >
              <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Side</p>
              <p className="mt-2 text-xl font-black">NO</p>
            </button>
          </div>

          <div>
            <label className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Amount (USDC)</label>
            <input
              type="number"
              min="1"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="mt-2 w-full rounded-[22px] border-2 border-black bg-white px-4 py-4 text-lg font-semibold text-foreground outline-none"
              placeholder="100"
            />
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={submitting} className="signal-button inline-flex flex-1 items-center justify-center gap-2 px-5 py-4 text-sm">
              {submitting ? "Submitting" : `Encrypt & Buy ${side}`}
              <ArrowRight size={14} />
            </button>
            {submitting && <PendingBadge />}
          </div>
        </form>
      </div>
    </div>
  );
};

export default TradeModal;
