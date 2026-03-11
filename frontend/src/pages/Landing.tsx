import Navbar from "@/components/Navbar";
import TraderView from "./TraderView";
import SponsorDashboard from "./SponsorDashboard";
import { PRIVATE_MARKET_ADDRESS, USDC_ADDRESS } from "@/lib/contract";
import type { ethers } from "ethers";

interface LandingProps {
  connected: boolean;
  address?: string;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  role: "sponsor" | "trader" | null;
  onConnect: () => void;
  onRoleChange: (role: "sponsor" | "trader") => void;
}

const Landing = ({
  connected,
  address,
  role,
  onConnect,
  onRoleChange,
}: LandingProps) => {
  const effectiveRole: "sponsor" | "trader" =
    role ?? "trader";

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        role={effectiveRole}
  onRoleChange={onRoleChange}
        connected={connected}
        onConnect={onConnect}
        address={address}
      />

      <main className="container mx-auto px-4 pb-12 space-y-8">
        <section className="brutal-card p-6">
          <h2 className="text-2xl md:text-3xl font-bold">
            Trade privately on encrypted prediction markets
          </h2>
          <p className="text-sm md:text-base mt-2 text-muted-foreground">
            All positions are encrypted on-chain with Zama FHE. Sponsors see pool movement, traders
            bet with conviction without leaking edge.
          </p>
          <div className="mt-4 grid gap-3 text-xs md:text-sm">
            <p>
              <span className="font-bold">PrivateMarket:</span> {PRIVATE_MARKET_ADDRESS}
            </p>
            <p>
              <span className="font-bold">USDC (Sepolia):</span> {USDC_ADDRESS} &middot; 6 decimals
            </p>
          </div>
        </section>

        {!connected ? (
          <section className="brutal-card p-6 flex flex-col items-start md:items-center md:text-center gap-4">
            <h3 className="text-xl font-bold">Connect wallet to get started</h3>
            <p className="text-sm text-muted-foreground max-w-xl">
              We use your wallet to determine if you are a whitelisted sponsor or a trader, and to
              derive per-user FHE keys for decrypting your encrypted balances.
            </p>
            <button
              onClick={onConnect}
              className="brutal-btn bg-foreground text-background px-6 py-3 text-base font-bold"
            >
              Connect Wallet
            </button>
          </section>
        ) : effectiveRole === "trader" ? (
          <TraderView />
        ) : (
          <SponsorDashboard />
        )}
      </main>
    </div>
  );
};

export default Landing;
