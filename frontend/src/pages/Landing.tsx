import Navbar from "@/components/Navbar";
import { NETWORK, PRIVATE_MARKET_ADDRESS, USDC_ADDRESS } from "@/lib/contract";
import type { ethers } from "ethers";
import { ArrowRight, Eye, LockKeyhole, Shield, Sparkles, Trophy } from "lucide-react";
import { Link } from "react-router-dom";

interface LandingProps {
  connected: boolean;
  address?: string;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  role: "sponsor" | "trader" | null;
  onConnect: () => void;
  onRoleChange: (role: "sponsor" | "trader") => void;
}

const Landing = ({ connected, address, role, onConnect, onRoleChange }: LandingProps) => {
  const effectiveRole: "sponsor" | "trader" = role ?? "trader";
  const ready = PRIVATE_MARKET_ADDRESS !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="min-h-screen bg-background">
      <div className="background-orbit background-orbit-one" />
      <div className="background-orbit background-orbit-two" />

      <Navbar
        role={effectiveRole}
        onRoleChange={onRoleChange}
        connected={connected}
        onConnect={onConnect}
        address={address}
        networkLabel={NETWORK.isLocal ? "Local test mode" : "Sepolia ready"}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-16 pt-6 md:px-6">
        <section className="protocol-header">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px] xl:items-end">
            <div>
              <p className="protocol-kicker">Private prediction infrastructure</p>
              <h1 className="protocol-title">Cipher-backed markets for hidden conviction and sponsor-only market sight.</h1>
              <p className="protocol-copy">
                Traders route encrypted size through a private AMM. Sponsors seed, monitor, and resolve markets without exposing participant inventory.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <div className="signal-chip">
                  <span className="signal-dot" />
                  Encrypted positions
                </div>
                <div className="signal-chip">Sponsor-only movement</div>
                <div className="signal-chip">Sepolia live</div>
              </div>
              <div className="mt-6 flex flex-wrap gap-3">
                {!connected ? (
                  <button onClick={onConnect} className="signal-button inline-flex items-center gap-2 px-6 py-4 text-sm">
                    <Sparkles size={15} />
                    Connect Wallet
                  </button>
                ) : (
                  <>
                    <Link to="/trader" className="signal-button inline-flex items-center gap-2 px-6 py-4 text-sm">
                      Open Trader
                      <ArrowRight size={15} />
                    </Link>
                    <Link to="/sponsor" className="signal-button signal-button-muted inline-flex items-center gap-2 px-6 py-4 text-sm">
                      Open Sponsor
                      <ArrowRight size={15} />
                    </Link>
                  </>
                )}
              </div>
            </div>
            <div className="grid gap-3">
              <div className="glass-stat">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Protocol Route</p>
                <p className="mt-2 text-2xl font-black text-foreground">Trade. Reveal. Resolve.</p>
                <p className="mt-2 text-sm text-muted-foreground">Separate trader and sponsor surfaces, shared private market core.</p>
              </div>
              <div className="glass-stat">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Contract</p>
                <p className="mt-2 break-all text-sm font-semibold text-foreground">{PRIVATE_MARKET_ADDRESS}</p>
              </div>
              <div className="glass-stat">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">USDC</p>
                <p className="mt-2 break-all text-sm font-semibold text-foreground">{USDC_ADDRESS}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Chain", value: NETWORK.isLocal ? "Local" : "Sepolia", note: "Execution target" },
            { label: "Privacy", value: "FHE", note: "Encrypted balances and positions" },
            { label: "Flow", value: "AMM", note: "Private order settlement" },
            { label: "Resolution", value: "Sponsor", note: "Outcome + winning share totals" },
          ].map((item) => (
            <div key={item.label} className="glass-stat">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
              <p className="mt-2 text-3xl font-black text-foreground">{item.value}</p>
              <p className="mt-2 text-sm text-muted-foreground">{item.note}</p>
            </div>
          ))}
        </section>

        {!ready && (
          <section className="market-panel border-[#f25f5c] bg-[#fff1f0]">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-foreground">Configuration needed</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Set `VITE_PRIVATE_MARKET_ADDRESS` and `VITE_USDC_ADDRESS` after deployment. For localhost FHE flows, also set the `VITE_GATEWAY_*` and verifier variables.
            </p>
          </section>
        )}

        {!connected ? (
          <section className="grid gap-5 lg:grid-cols-3">
            <div className="market-panel">
              <div className="signal-chip w-fit">
                <LockKeyhole size={13} />
                Trader Flow
              </div>
              <h2 className="text-2xl font-black text-foreground">Deposit, trade privately, and claim without exposing inventory.</h2>
              <p className="text-sm text-muted-foreground">Wallet role is detected on connect. Private decrypt requests only happen when the user chooses to refresh or settle.</p>
            </div>
            <div className="market-panel">
              <div className="signal-chip w-fit">
                <Eye size={13} />
                Sponsor Flow
              </div>
              <h2 className="text-2xl font-black text-foreground">Create markets, inspect encrypted movement, and resolve outcomes.</h2>
              <p className="text-sm text-muted-foreground">Sponsor operations stay isolated from the trader surface, with separate control and resolution tooling.</p>
            </div>
            <div className="market-panel">
              <div className="signal-chip w-fit">
                <Shield size={13} />
                Access Layer
              </div>
              <h2 className="text-2xl font-black text-foreground">Connect once to unlock the right command path.</h2>
              <p className="text-sm text-muted-foreground">
                {NETWORK.isLocal ? "Local node for testing, Sepolia for production." : "Current target: Sepolia."}
              </p>
              <button onClick={onConnect} className="signal-button mt-auto px-6 py-4 text-sm">
                Connect Wallet
              </button>
            </div>
          </section>
        ) : (
          <section className="grid gap-6 md:grid-cols-2">
            <div className="market-panel">
              <div className="signal-chip w-fit">
                <LockKeyhole size={13} />
                Trader Workspace
              </div>
              <h2 className="text-3xl font-black text-foreground">Route encrypted orders, fund the private vault, and claim payouts.</h2>
              <p className="hero-copy">
                The trader surface is built for compact execution: private state controls, encrypted market cards, and cache-aware decrypt flows.
              </p>
              <div className="mt-2">
                <Link to="/trader" className="signal-button inline-flex items-center gap-2 px-6 py-4 text-sm">
                  Go To Trader Page
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>

            <div className="market-panel">
              <div className="signal-chip w-fit">
                <Trophy size={13} />
                Sponsor Workspace
              </div>
              <h2 className="text-3xl font-black text-foreground">Create, monitor, and resolve markets with sponsor-only signal access.</h2>
              <p className="hero-copy">
                Market creation, encrypted movement views, and resolution now live together in a dedicated protocol console.
              </p>
              <div className="mt-2">
                <Link to="/sponsor" className="signal-button inline-flex items-center gap-2 px-6 py-4 text-sm">
                  Go To Sponsor Page
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Landing;
