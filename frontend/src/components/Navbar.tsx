import { useState } from "react";
import { Wallet, Menu, X } from "lucide-react";

interface NavbarProps {
  role: "sponsor" | "trader";
  onRoleChange: (role: "sponsor" | "trader") => void;
  connected: boolean;
  onConnect: () => void;
  address?: string;
}

const Navbar = ({ role, onRoleChange, connected, onConnect, address }: NavbarProps) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="brutal-card-sm bg-primary p-4 mb-6">
      <div className="container mx-auto flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-primary-foreground tracking-tight">
          PrivateMarket
        </h1>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() => onRoleChange("sponsor")}
            className={`brutal-btn px-4 py-2 text-sm ${
              role === "sponsor"
                ? "bg-secondary text-secondary-foreground"
                : "bg-card text-foreground"
            }`}
          >
            Sponsor
          </button>
          <button
            onClick={() => onRoleChange("trader")}
            className={`brutal-btn px-4 py-2 text-sm ${
              role === "trader"
                ? "bg-secondary text-secondary-foreground"
                : "bg-card text-foreground"
            }`}
          >
            Trader
          </button>
          <button
            onClick={onConnect}
            className="brutal-btn bg-foreground text-background px-4 py-2 text-sm flex items-center gap-2"
          >
            <Wallet size={16} />
            {connected ? (address ? `${address.slice(0,6)}...${address.slice(-4)}` : "Connected") : "Connect"}
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-primary-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden mt-4 flex flex-col gap-2">
          <button
            onClick={() => { onRoleChange("sponsor"); setMobileOpen(false); }}
            className={`brutal-btn px-4 py-2 text-sm w-full ${
              role === "sponsor" ? "bg-secondary text-secondary-foreground" : "bg-card text-foreground"
            }`}
          >
            Sponsor
          </button>
          <button
            onClick={() => { onRoleChange("trader"); setMobileOpen(false); }}
            className={`brutal-btn px-4 py-2 text-sm w-full ${
              role === "trader" ? "bg-secondary text-secondary-foreground" : "bg-card text-foreground"
            }`}
          >
            Trader
          </button>
          <button
            onClick={() => { onConnect(); setMobileOpen(false); }}
            className="brutal-btn bg-foreground text-background px-4 py-2 text-sm flex items-center gap-2 justify-center"
          >
            <Wallet size={16} />
            {connected ? (address ? `${address.slice(0,6)}...${address.slice(-4)}` : "Connected") : "Connect"}
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
