import { Calendar, ArrowRight } from "lucide-react";
import type { Market } from "@/data/mockData";

interface Props {
  market: Market;
  onTrade: (market: Market) => void;
}

const TraderMarketCard = ({ market, onTrade }: Props) => {
  return (
    <div className="brutal-card p-5 flex flex-col gap-3 hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all cursor-pointer"
      onClick={() => market.status === "open" && onTrade(market)}
    >
      <h3 className="text-lg font-bold leading-tight">{market.question}</h3>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar size={14} />
          {market.resolutionDate}
        </span>
        <span
          className={`brutal-btn px-2 py-0.5 text-xs ${
            market.status === "open"
              ? "bg-mint text-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {market.status.toUpperCase()}
        </span>
      </div>


      {/* <div className="w-full">
        <div className="flex justify-between text-xs font-bold mb-1">
          <span>YES {market.yesPercentage}%</span>
          <span>NO {100 - market.yesPercentage}%</span>
        </div>
        <div className="w-full h-4 border-[3px] border-foreground flex overflow-hidden rounded-full">
          <div className="bg-mint h-full" style={{ width: `${market.yesPercentage}%` }} />
          <div className="bg-destructive h-full" style={{ width: `${100 - market.yesPercentage}%` }} />
        </div>
      </div> */}

      {market.status === "open" && (
        <button className="brutal-btn bg-primary text-primary-foreground px-4 py-2 text-sm self-end flex items-center gap-1">
          Trade <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
};

export default TraderMarketCard;
