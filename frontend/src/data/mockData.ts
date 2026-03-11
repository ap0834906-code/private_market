export interface Market {
  id: string;
  question: string;
  resolutionDate: string;
  liquidityCap: number;
  yesPercentage: number;
  totalTrades: number;
  status: "open" | "resolved";
  outcome?: "YES" | "NO";
  createdBy: string;
}

export interface Position {
  marketId: string;
  question: string;
  side: "YES" | "NO";
  shares: number;
  avgPrice: number;
  status: "open" | "resolved";
  outcome?: "YES" | "NO";
  payout?: number;
}

export const mockMarkets: Market[] = [
  {
    id: "0x01",
    question: "Will ETH surpass $5,000 by Q2 2026?",
    resolutionDate: "2026-06-30",
    liquidityCap: 50000,
    yesPercentage: 67,
    totalTrades: 1842,
    status: "open",
    createdBy: "0xSponsor1",
  },
  {
    id: "0x02",
    question: "Will the US approve a spot SOL ETF by end of 2026?",
    resolutionDate: "2026-12-31",
    liquidityCap: 100000,
    yesPercentage: 43,
    totalTrades: 3291,
    status: "open",
    createdBy: "0xSponsor1",
  },
  {
    id: "0x03",
    question: "Will Base L2 TVL exceed $20B by March 2026?",
    resolutionDate: "2026-03-01",
    liquidityCap: 25000,
    yesPercentage: 78,
    totalTrades: 956,
    status: "resolved",
    outcome: "YES",
    createdBy: "0xSponsor1",
  },
  {
    id: "0x04",
    question: "Will Vitalik release a new EIP for privacy by Q3 2026?",
    resolutionDate: "2026-09-30",
    liquidityCap: 30000,
    yesPercentage: 55,
    totalTrades: 712,
    status: "open",
    createdBy: "0xSponsor1",
  },
];

export const mockPositions: Position[] = [
  {
    marketId: "0x01",
    question: "Will ETH surpass $5,000 by Q2 2026?",
    side: "YES",
    shares: 150,
    avgPrice: 0.62,
    status: "open",
  },
  {
    marketId: "0x03",
    question: "Will Base L2 TVL exceed $20B by March 2026?",
    side: "YES",
    shares: 200,
    avgPrice: 0.71,
    status: "resolved",
    outcome: "YES",
    payout: 200,
  },
  {
    marketId: "0x02",
    question: "Will the US approve a spot SOL ETF by end of 2026?",
    side: "NO",
    shares: 80,
    avgPrice: 0.55,
    status: "open",
  },
];
