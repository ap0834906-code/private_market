import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import SponsorMarketCard from "@/components/SponsorMarketCard";
import CreateMarketModal from "@/components/CreateMarketModal";
import { contractRead } from "@/lib/contract";
import { fromUsdcUnits } from "@/lib/fhe";
import { useToast } from "@/components/ui/use-toast";
import { ethers } from "ethers";

interface SponsorMarket {
  id: bigint;
  question: string;
  resolutionDate: number;
  resolved: boolean;
  outcome: boolean;
  liquidityCap: bigint;
  totalEscrowed: bigint;
}

const SponsorDashboard = () => {
  const [showCreate, setShowCreate] = useState(false);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [markets, setMarkets] = useState<SponsorMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if ((window as any).ethereum && !provider) {
      const p = new ethers.BrowserProvider((window as any).ethereum as any);
      setProvider(p);
      p.getSigner().then(s => {
        setSigner(s);
        s.getAddress().then(a => setAddress(a));
      }).catch(() => {});
    }
  }, [provider]);

  const readContract = useMemo(
    () => (provider ? contractRead(provider) : contractRead(ethers.getDefaultProvider())),
    [provider],
  );

  useEffect(() => {
    if (!address) return;
    void loadSponsorMarkets();
  }, [address]);

  async function loadSponsorMarkets() {
    if (!address) return;
    setLoading(true);
    try {
      const count: bigint = await readContract.marketCount();
      const list: SponsorMarket[] = [];
      for (let i = 0n; i < count; i++) {
        const m = await readContract.getMarket(i);
        const sponsorAddr: string = m[0];
        if (sponsorAddr.toLowerCase() !== address.toLowerCase()) continue;
        list.push({
          id: i,
          question: m[1],
          resolutionDate: Number(m[2]),
          resolved: Boolean(m[3]),
          outcome: Boolean(m[4]),
          liquidityCap: m[5],
          totalEscrowed: m[6],
        });
      }
      setMarkets(list);
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "Failed to load sponsor markets",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-bold">Sponsor Dashboard</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your prediction markets
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="brutal-btn bg-secondary text-secondary-foreground px-5 py-3 text-base flex items-center gap-2"
        >
          <Plus size={18} /> CREATE MARKET
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Markets", value: markets.length },
          { label: "Active", value: markets.filter(m => !m.resolved).length },
          { label: "Resolved", value: markets.filter(m => m.resolved).length },
          {
            label: "Total Escrowed (USDC)",
            value: markets.length
              ? markets
                  .reduce((s, m) => s + fromUsdcUnits(m.totalEscrowed), 0)
                  .toLocaleString(undefined, { maximumFractionDigits: 2 })
              : "0",
          },
        ].map(stat => (
          <div key={stat.label} className="brutal-card-sm bg-lavender p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">{stat.label}</p>
            <p className="text-3xl font-bold mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="brutal-card p-5 animate-pulse h-40" />
          ))}
        {!loading &&
          markets.map(market => (
            <SponsorMarketCard
              key={market.id.toString()}
              market={market}
              provider={provider}
              signer={signer}
              address={address}
            />
          ))}
      </div>

      <CreateMarketModal open={showCreate} onClose={() => setShowCreate(false)} signer={signer} />
    </div>
  );
};

export default SponsorDashboard;
