import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";

export default async function handleEvent(
  args: EventHandlerArgs<
    Indexer,
    "AlloV2/Registry/V1" | "AlloV1/ProjectRegistry/V1", // the second type will change in the next PR to Allo/V1
    "RoleRevoked"
  >
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    context: { db },
  } = args;

  switch (args.event.contractName) {
    case "AlloV2/Registry/V1": {
      const account = parseAddress(event.params.account);
      const role = event.params.role.toLocaleLowerCase();
      const project = await db.getProjectById(chainId, role);

      // The role value for a member is the profileId in Allo V1
      // which is the project id in this database.
      // If we don't find a project with that id we can't remove the role.
      if (project === null) {
        return [];
      }

      return [
        {
          type: "DeleteAllProjectRolesByRoleAndAddress",
          projectRole: {
            chainId,
            projectId: project.id,
            address: account,
            role: "member",
          },
        },
      ];
    }

    default: {
      return [];
    }
  }
}
