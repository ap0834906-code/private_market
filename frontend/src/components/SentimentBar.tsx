interface SentimentBarProps {
  yesPercentage: number;
}

const SentimentBar = ({ yesPercentage }: SentimentBarProps) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
        <span>Yes {yesPercentage}%</span>
        <span>No {100 - yesPercentage}%</span>
      </div>
      <div className="overflow-hidden rounded-full border-2 border-black bg-white/70">
        <div className="flex h-4">
          <div
            className="bg-[linear-gradient(90deg,#76d4a0,#3bb273)] transition-all duration-700"
            style={{ width: `${yesPercentage}%` }}
          />
          <div
            className="bg-[linear-gradient(90deg,#f97979,#f25f5c)] transition-all duration-700"
            style={{ width: `${100 - yesPercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default SentimentBar;
