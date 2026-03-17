import { DollarSign, Trophy } from "lucide-react";
import PendingBadge from "./PendingBadge";

export interface PositionView {
  marketId: string;
  question: string;
  side: "YES" | "NO";
  status: "open" | "resolved";
  outcome?: "YES" | "NO";
  payout?: number;
}

interface Props {
  position: PositionView;
  onClaim?: () => void;
  claiming?: boolean;
}

const PositionCard = ({ position, onClaim, claiming }: Props) => {
  const isWinner = position.status === "resolved" && position.outcome === position.side;

  return (
    <div className="market-panel">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-black leading-tight text-foreground">{position.question}</h3>
        <div
          className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
            position.side === "YES" ? "bg-[#d8f3dc] text-black" : "bg-[#ffcad4] text-black"
          }`}
        >
          {position.side}
        </div>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Position</p>
          <p className="mt-2 text-lg font-bold text-foreground">{position.side}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Visibility</p>
          <p className="mt-2 text-lg font-bold text-foreground">Private</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Status</p>
          <p className="mt-2 text-lg font-bold text-foreground">{position.status}</p>
        </div>
      </div>

      {isWinner && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-[#fff6db] p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.16em] text-foreground">
              <Trophy size={14} />
              Winning position
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Claim your payout back into the encrypted internal balance.
            </p>
          </div>
          {claiming ? (
            <PendingBadge />
          ) : (
            <button onClick={onClaim} className="signal-button inline-flex items-center gap-2 px-4 py-3 text-sm">
              <DollarSign size={14} />
              Claim
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PositionCard;
