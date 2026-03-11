import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import PendingBadge from "./PendingBadge";

interface Props {
  onVerified: () => void;
}

const WorldIdGate = ({ onVerified }: Props) => {
  const [verifying, setVerifying] = useState(false);

  const handleVerify = () => {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      onVerified();
    }, 2500);
  };

  return (
    <div className="brutal-card bg-lavender p-8 text-center max-w-md mx-auto mt-12">
      <ShieldCheck size={64} className="mx-auto mb-4 text-primary" />
      <h2 className="text-2xl font-bold mb-2">Verify You're Human</h2>
      <p className="text-muted-foreground mb-6">
        World ID verification is required before your first trade on PrivateMarket.
      </p>
      {verifying ? (
        <div className="flex justify-center">
          <PendingBadge />
        </div>
      ) : (
        <button onClick={handleVerify} className="brutal-btn bg-primary text-primary-foreground px-8 py-3 text-lg">
          VERIFY WITH WORLD ID
        </button>
      )}
    </div>
  );
};

export default WorldIdGate;
