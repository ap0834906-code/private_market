interface SentimentBarProps {
  yesPercentage: number;
}

const SentimentBar = ({ yesPercentage }: SentimentBarProps) => {
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs font-bold mb-1">
        <span className="text-foreground">YES {yesPercentage}%</span>
        <span className="text-foreground">NO {100 - yesPercentage}%</span>
      </div>
      <div className="w-full h-6 border-[3px] border-foreground flex overflow-hidden rounded-full">
        <div
          className="bg-mint h-full transition-all duration-700 animate-pulse-bar"
          style={{ width: `${yesPercentage}%` }}
        />
        <div
          className="bg-destructive h-full transition-all duration-700"
          style={{ width: `${100 - yesPercentage}%` }}
        />
      </div>
    </div>
  );
};

export default SentimentBar;
