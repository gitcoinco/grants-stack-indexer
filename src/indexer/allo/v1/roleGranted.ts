import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";
import { PROGRAM_ADMIN_ROLE, PROGRAM_OPERATOR_ROLE } from "./roles.js";

export default async function handleEvent(
  args: EventHandlerArgs<
    Indexer,
    "AlloV1/ProgramFactory/V1" | "AlloV1/RoundImplementation/V1",
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
      const programAddress = parseAddress(event.address);
      const project = await db.getProjectById(programAddress);
      if (project === null) {
        logger.error({
          msg: `Program/Project ${programAddress} not found`,
          event,
        });
        return [];
      }

      const account = parseAddress(event.params.account);
      const role = event.params.role.toLocaleLowerCase();

      switch (role) {
        case PROGRAM_ADMIN_ROLE: {
          return [
            {
              type: "InsertProjectRole",
              projectRole: {
                chainId,
                projectId: programAddress,
                address: account,
                role: "owner",
                createdAtBlock: event.blockNumber,
              },
            },
          ];
        }

        case PROGRAM_OPERATOR_ROLE: {
          return [
            {
              type: "InsertProjectRole",
              projectRole: {
                chainId,
                projectId: programAddress,
                address: account,
                role: "member",
                createdAtBlock: event.blockNumber,
              },
            },
          ];
        }

        default: {
          logger.error({
            msg: `Unknown role ${role} for program ${programAddress}`,
            event,
          });
          return [];
        }
      }
    }

    default: {
      return [];
    }
  }
}
