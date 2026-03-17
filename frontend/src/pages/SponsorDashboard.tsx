import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import Navbar from "@/components/Navbar";
import SponsorMarketCard from "@/components/SponsorMarketCard";
import CreateMarketModal from "@/components/CreateMarketModal";
import { NETWORK, connectWallet, contractRead, getInjectedProvider } from "@/lib/contract";
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
  const sponsorStorageKey = useMemo(
    () => (address ? `private-market:sponsor:${NETWORK.chainId}:${address.toLowerCase()}` : null),
    [address],
  );

  async function handleConnect() {
    const result = await connectWallet();
    if (result.provider && result.signer && result.address) {
      setProvider(result.provider);
      setSigner(result.signer);
      setAddress(result.address);
    }
  }

  useEffect(() => {
    const injected = getInjectedProvider();
    if (!injected || provider) return;
    const nextProvider = new ethers.BrowserProvider(injected);
    setProvider(nextProvider);
    nextProvider
      .getSigner()
      .then(async (nextSigner) => {
        setSigner(nextSigner);
        setAddress(await nextSigner.getAddress());
      })
      .catch(() => undefined);
  }, [provider]);

  const readContract = useMemo(
    () => (provider ? contractRead(provider) : null),
    [provider],
  );

  async function loadSponsorMarkets() {
    if (!address || !readContract) return;
    try {
      setLoading(true);
      const count = (await readContract.marketCount()) as bigint;
      const nextMarkets: SponsorMarket[] = [];
      for (let index = 0n; index < count; index++) {
        const market = await readContract.getMarket(index);
        const sponsor = market[0] as string;
        if (sponsor.toLowerCase() !== address.toLowerCase()) continue;
        nextMarkets.push({
          id: index,
          question: market[1],
          resolutionDate: Number(market[2]),
          resolved: Boolean(market[3]),
          outcome: Boolean(market[4]),
          liquidityCap: market[5],
          totalEscrowed: market[6],
        });
      }
      setMarkets(nextMarkets);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to load sponsor markets.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSponsorMarkets();
  }, [address, readContract]);

  return (
    <div className="min-h-screen bg-background">
      <div className="background-orbit background-orbit-one" />
      <div className="background-orbit background-orbit-two" />
      <Navbar
        role="sponsor"
        connected={Boolean(address)}
        onConnect={handleConnect}
        address={address ?? undefined}
        networkLabel={NETWORK.isLocal ? "Local test mode" : "Sepolia ready"}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 pt-6 md:px-6">
        <div className="space-y-6">
          <div className="protocol-header">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="protocol-kicker">Sponsor command center</p>
                <h2 className="protocol-title">Encrypted market creation, movement view, and settlement in one console.</h2>
                <p className="protocol-copy">
                  Monitor sponsor-only market movement, resolve with actual side totals, and keep the command layer compact.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="signal-chip">
                  <span className="signal-dot" />
                  Sponsor-only lens
                </div>
                <button onClick={() => setShowCreate(true)} className="signal-button inline-flex items-center gap-2 px-5 py-4 text-sm">
                  <Plus size={16} />
                  Create Market
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Markets", value: markets.length.toString() },
              { label: "Active", value: markets.filter((market) => !market.resolved).length.toString() },
              { label: "Resolved", value: markets.filter((market) => market.resolved).length.toString() },
              {
                label: "Seeded Collateral",
                value: `${markets.reduce((sum, market) => sum + fromUsdcUnits(market.totalEscrowed), 0).toFixed(2)} USDC`,
              },
            ].map((stat) => (
              <div key={stat.label} className="glass-stat">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">{stat.label}</p>
                <p className="mt-2 text-3xl font-black text-foreground">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5">
            {loading &&
              Array.from({ length: 2 }).map((_, index) => <div key={index} className="market-panel h-48 animate-pulse" />)}
            {!loading &&
              markets.map((market) => (
                <SponsorMarketCard
                  key={market.id.toString()}
                  market={market}
                  provider={provider}
                  signer={signer}
                  address={address}
                  sponsorStorageKey={sponsorStorageKey}
                  onResolved={() => void loadSponsorMarkets()}
                />
              ))}
          </div>

          <CreateMarketModal
            open={showCreate}
            onClose={() => setShowCreate(false)}
            onCreated={() => void loadSponsorMarkets()}
            signer={signer}
          />
        </div>
      </main>
    </div>
  );
};

export default SponsorDashboard;
