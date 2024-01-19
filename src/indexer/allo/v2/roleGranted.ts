import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";

const ALLO_OWNER_ROLE =
  "0x815b5a78dc333d344c7df9da23c04dbd432015cc701876ddb9ffe850e6882747";

export default async function handleEvent(
  args: EventHandlerArgs<
    Indexer,
    "AlloV2/Registry/V1" | "AlloV1/ProjectRegistry/V1", // the second type will change in the next PR to Allo/V1
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
      const project = await db.getProjectById(role);
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

    default: {
      return [];
    }
  }
}
