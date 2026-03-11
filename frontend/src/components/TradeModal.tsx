import { useState } from "react";
import { X } from "lucide-react";
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

  const handleTrade = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSubmit) {
      onClose();
      return;
    }
    setSubmitting(true);
    const numericAmount = Number(amount || "0");
    onSubmit(side, numericAmount);
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
      <div className="brutal-card bg-card p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Trade</h2>
          <button onClick={onClose} className="brutal-btn bg-card p-2">
            <X size={20} />
          </button>
        </div>

        <p className="font-bold text-base mb-4">{market.question}</p>

        <form onSubmit={handleTrade} className="flex flex-col gap-4">
          {/* YES/NO toggle */}
          <div className="flex border-[3px] border-foreground rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setSide("YES")}
              className={`flex-1 py-3 font-bold text-lg transition-colors ${
                side === "YES"
                  ? "bg-mint text-foreground"
                  : "bg-card text-muted-foreground"
              }`}
            >
              YES
            </button>
            <button
              type="button"
              onClick={() => setSide("NO")}
              className={`flex-1 py-3 font-bold text-lg border-l-[3px] border-foreground transition-colors ${
                side === "NO"
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-card text-muted-foreground"
              }`}
            >
              NO
            </button>
          </div>

          <div>
            <label className="text-sm font-bold uppercase mb-1 block">Amount ($)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full p-3 border-[3px] border-foreground bg-card text-foreground font-sans text-base rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="100"
              required
              min="1"
            />
          </div>

          

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className={`brutal-btn px-6 py-3 text-base flex-1 ${
                side === "YES"
                  ? "bg-mint text-foreground"
                  : "bg-destructive text-destructive-foreground"
              }`}
            >
              {submitting ? "PLACING..." : `BUY ${side}`}
            </button>
            {submitting && <PendingBadge />}
          </div>
        </form>
      </div>
    </div>
  );
};

export default TradeModal;
