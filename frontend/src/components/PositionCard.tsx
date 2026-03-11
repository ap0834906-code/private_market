import { Lock, DollarSign } from "lucide-react";
import PendingBadge from "./PendingBadge";

export interface PositionView {
  marketId: string;
  question: string;
  side: "YES" | "NO";
  shares: number;
  avgPrice: number;
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
    <div className="brutal-card p-5 flex flex-col gap-3">
      <h3 className="text-base font-bold leading-tight">{position.question}</h3>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span
          className={`brutal-btn px-3 py-1 text-xs ${
            position.side === "YES" ? "bg-mint text-foreground" : "bg-destructive text-destructive-foreground"
          }`}
        >
          {position.side}
        </span>
        <span className="flex items-center gap-1">
          <Lock size={12} /> {position.shares} shares
        </span>
        <span className="text-muted-foreground">
          Avg: ${position.avgPrice.toFixed(2)}
        </span>
        <span
          className={`brutal-btn px-2 py-0.5 text-xs ${
            position.status === "open" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {position.status.toUpperCase()}
        </span>
      </div>

      {isWinner && (
        <div className="flex items-center gap-3">
          {claiming ? (
            <PendingBadge />
          ) : (
            <button
              onClick={onClaim}
              className="brutal-btn bg-secondary text-secondary-foreground px-4 py-2 text-sm flex items-center gap-1"
            >
              <DollarSign size={14} /> Claim ${position.payout}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PositionCard;
