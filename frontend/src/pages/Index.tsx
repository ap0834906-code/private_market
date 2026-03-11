import { useEffect, useState } from "react";
import Landing from "./Landing";
import { connectWallet, contractRead } from "@/lib/contract";
import { ethers } from "ethers";

const Index = () => {
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [role, setRole] = useState<"sponsor" | "trader" | null>(null);

  useEffect(() => {
    if ((window as any).ethereum && !provider) {
      const p = new ethers.BrowserProvider((window as any).ethereum as any);
      setProvider(p);
    }
  }, [provider]);

  async function handleConnect() {
    const res = await connectWallet();
    if (res.signer && res.address) {
      setConnected(true);
      setAddress(res.address);
      setProvider(res.provider);
      setSigner(res.signer);
      await detectRole(res.provider, res.address);
    }
  }

  async function detectRole(p: ethers.BrowserProvider | null, addr: string) {
    try {
      const read = contractRead(p ?? ethers.getDefaultProvider());
      const sponsor = await read.getSponsor(addr);
      const isWhitelisted = Boolean(sponsor[1]);
      setRole(isWhitelisted ? "sponsor" : "trader");
    } catch {
      setRole("trader");
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
