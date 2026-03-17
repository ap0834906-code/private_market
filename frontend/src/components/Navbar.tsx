import { Shield, Sparkles, Wallet } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

interface NavbarProps {
  role: "sponsor" | "trader";
  onRoleChange?: (role: "sponsor" | "trader") => void;
  connected: boolean;
  onConnect: () => void;
  address?: string;
  networkLabel: string;
}

const Navbar = ({ role, onRoleChange, connected, onConnect, address, networkLabel }: NavbarProps) => {
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-40 border-b border-black/10 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-black bg-secondary text-black shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="text-lg font-black uppercase tracking-[0.2em] text-foreground">Cipher Markets</p>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{networkLabel}</p>
          </div>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/trader"
            onClick={() => onRoleChange?.("trader")}
            className={`pill-tab ${location.pathname === "/trader" || role === "trader" ? "pill-tab-active" : ""}`}
          >
            <Wallet size={14} />
            Trader
          </Link>
          <Link
            to="/sponsor"
            onClick={() => onRoleChange?.("sponsor")}
            className={`pill-tab ${location.pathname === "/sponsor" || role === "sponsor" ? "pill-tab-active" : ""}`}
          >
            <Shield size={14} />
            Sponsor
          </Link>
          <button onClick={onConnect} className="signal-button px-5 py-3 text-sm">
            {connected ? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Connected") : "Connect Wallet"}
          </button>
        </div>

        <button onClick={onConnect} className="signal-button px-4 py-3 text-xs md:hidden">
          {connected ? "Wallet Live" : "Connect"}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
