import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";
import { PROGRAM_ADMIN_ROLE } from "./roles.js";

export default async function handleEvent(
  args: EventHandlerArgs<
    Indexer,
    "AlloV1/ProgramFactory/V1" | "AlloV2/Registry/V1",
    "RoleGranted"
  >
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    context: { db, logger },
  } = args;

  switch (args.event.contractName) {
    case "AlloV1/ProgramFactory/V1": {
      const projectId = parseAddress(event.address);
      const project = await db.getProjectById(projectId);
      if (project === null) {
        logger.error({
          msg: `Program/Project ${projectId} not found`,
          event,
        });
        return [];
      }

      if (event.params.role === PROGRAM_ADMIN_ROLE) {
        return [
          {
            type: "UpdateProject",
            chainId,
            projectId,
            project: {
              ownerAddresses: [
                ...project.ownerAddresses,
                parseAddress(event.params.account),
              ],
            },
          },
          {
            type: "InsertProjectRole",
            projectRole: {
              chainId,
              projectId,
              address: parseAddress(event.params.account),
              role: "owner",
              createdAtBlock: event.blockNumber,
            },
          },
        ];
      } else {
        return [];
      }
    }

    default: {
      return [];
    }
  }
}
