import { useEffect, useState } from "react";
import Landing from "./Landing";
import { connectWallet, contractRead, getInjectedProvider } from "@/lib/contract";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [role, setRole] = useState<"sponsor" | "trader" | null>(null);

  useEffect(() => {
    const injected = getInjectedProvider();
    if (!injected || provider) return;
    setProvider(new ethers.BrowserProvider(injected));
  }, [provider]);

  async function handleConnect() {
    const res = await connectWallet();
    if (res.signer && res.address) {
      setConnected(true);
      setAddress(res.address);
      setProvider(res.provider);
      setSigner(res.signer);
      const nextRole = await detectRole(res.provider, res.address);
      navigate(nextRole === "sponsor" ? "/sponsor" : "/trader");
    }
  }

  async function detectRole(p: ethers.BrowserProvider | null, addr: string): Promise<"sponsor" | "trader"> {
    try {
      if (!p) {
        setRole("trader");
        return "trader";
      }
      const read = contractRead(p);
      const sponsor = await read.getSponsor(addr);
      const isWhitelisted = Boolean(sponsor[1]);
      const nextRole = isWhitelisted ? "sponsor" : "trader";
      setRole(nextRole);
      return nextRole;
    } catch {
      setRole("trader");
      return "trader";
    }
  }

  return (
    <Landing
      connected={connected}
      address={address}
      provider={provider}
      signer={signer}
      role={role}
      onConnect={handleConnect}
      onRoleChange={(r: "sponsor" | "trader") => setRole(r)}
    />
  );
};

export default Index;
