import { Block } from "chainsauce";
import { Application } from "../../database/schema.js";

export async function updateApplicationStatus(
  application: Application,
  newStatus: Application["status"],
  blockNumber: bigint,
  getBlock: () => Promise<Block>
): Promise<
  Pick<Application, "status" | "statusUpdatedAtBlock" | "statusSnapshots">
> {
  const statusSnapshots = [...application.statusSnapshots];

  if (application.status !== newStatus) {
    const block = await getBlock();

    statusSnapshots.push({
      status: newStatus,
      updatedAtBlock: blockNumber.toString(),
      updatedAt: new Date(block.timestamp * 1000),
    });
  }

  return {
    status: newStatus,
    statusUpdatedAtBlock: blockNumber,
    statusSnapshots: statusSnapshots,
  };
}
