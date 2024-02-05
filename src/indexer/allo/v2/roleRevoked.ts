import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";
import { Round } from "../../../database/schema.js";

export default async function handleEvent(
  args: EventHandlerArgs<
    Indexer,
    "AlloV2/Registry/V1" | "AlloV2/Allo/V1",
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

    case "AlloV2/Allo/V1": {
      const role = event.params.role.toLocaleLowerCase();
      const account = parseAddress(event.params.account);
      let round: Round | null = null;

      // search for a round where the admin role is the role granted
      round = await db.getRoundByRole(chainId, "admin", role);
      if (round !== null) {
        return [
          {
            type: "DeleteAllRoundRolesByRoleAndAddress",
            roundRole: {
              chainId,
              roundId: round.id,
              address: account,
              role: "admin",
            },
          },
        ];
      }

      // search for a round where the manager role is the role granted
      round = await db.getRoundByRole(chainId, "manager", role);
      if (round !== null) {
        return [
          {
            type: "DeleteAllRoundRolesByRoleAndAddress",
            roundRole: {
              chainId,
              roundId: round.id,
              address: account,
              role: "manager",
            },
          },
        ];
      }

      return [];
    }

    default: {
      return [];
    }
  }
}
