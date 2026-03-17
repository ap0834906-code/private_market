import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async () => {
  // Intentionally empty.
  // We use explicit runnable scripts for local/Sepolia deployment so `npx hardhat node`
  // can start without auto-running a deployment flow.
};

export default func;
func.id = "noop_deploy";
func.tags = ["noop"];
