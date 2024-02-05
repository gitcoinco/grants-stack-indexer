import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";
import { Round } from "../../../database/schema.js";

const ALLO_OWNER_ROLE =
  "0x815b5a78dc333d344c7df9da23c04dbd432015cc701876ddb9ffe850e6882747";

export default async function handleEvent(
  args: EventHandlerArgs<
    Indexer,
    "AlloV2/Registry/V1" | "AlloV2/Allo/V1",
    "RoleGranted"
  >
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    context: { db },
  } = args;

  switch (args.event.contractName) {
    case "AlloV2/Registry/V1": {
      const role = event.params.role.toLocaleLowerCase();
      if (role === ALLO_OWNER_ROLE) {
        return [];
      }

      const account = parseAddress(event.params.account);
      const project = await db.getProjectById(chainId, role);
      // The member role for an Allo V2 profile, is the profileId itself.
      // If a project exists with that id, we create the member role
      // If it doesn't exists we create a pending project role. This can happens
      // when a new project is created, since in Allo V2 the RoleGranted event for a member is
      // emitted before the ProfileCreated event.
      if (project !== null) {
        return [
          {
            type: "InsertProjectRole",
            projectRole: {
              chainId,
              projectId: project.id,
              address: account,
              role: "member",
              createdAtBlock: event.blockNumber,
            },
          },
        ];
      }

      return [
        {
          type: "InsertPendingProjectRole",
          pendingProjectRole: {
            chainId,
            role: role,
            address: account,
            createdAtBlock: event.blockNumber,
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
            type: "InsertRoundRole",
            roundRole: {
              chainId,
              roundId: round.id,
              role: "admin",
              address: account,
              createdAtBlock: event.blockNumber,
            },
          },
        ];
      }

      // search for a round where the manager role is the role granted
      round = await db.getRoundByRole(chainId, "manager", role);
      if (round !== null) {
        return [
          {
            type: "InsertRoundRole",
            roundRole: {
              chainId,
              roundId: round.id,
              role: "manager",
              address: account,
              createdAtBlock: event.blockNumber,
            },
          },
        ];
      }

      return [
        {
          type: "InsertPendingRoundRole",
          pendingRoundRole: {
            chainId,
            role: role,
            address: account,
            createdAtBlock: event.blockNumber,
          },
        },
      ];
    }

    default: {
      return [];
    }
  }
}
