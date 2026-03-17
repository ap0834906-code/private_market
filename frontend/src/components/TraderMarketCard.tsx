import { ArrowRight, Calendar, LockKeyhole } from "lucide-react";
import type { Market } from "@/data/mockData";

interface Props {
  market: Market;
  onTrade: (market: Market) => void;
}

const TraderMarketCard = ({ market, onTrade }: Props) => {
  return (
    <div className="market-panel group">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            <LockKeyhole size={12} />
            Encrypted Order Flow
          </div>
          <h3 className="max-w-xl text-xl font-black leading-tight text-foreground">{market.question}</h3>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
            market.status === "open" ? "bg-[#d8f3dc] text-black" : "bg-black text-white"
          }`}
        >
          {market.status}
        </div>
      </div>

      <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em]">Resolution</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Calendar size={14} />
            {market.resolutionDate}
          </p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em]">Liquidity Cap</p>
          <p className="mt-2 text-sm font-semibold text-foreground">${market.liquidityCap.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.18em]">Signal</p>
          <p className="mt-2 text-sm font-semibold text-foreground">{market.totalTrades} encrypted fills</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Private sizing, hidden positions, sponsor-only pool visibility.
        </p>
        <button
          onClick={() => market.status === "open" && onTrade(market)}
          className="signal-button inline-flex items-center gap-2 px-4 py-3 text-sm"
        >
          Trade
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default TraderMarketCard;
