import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";
import { PROGRAM_ADMIN_ROLE, PROGRAM_OPERATOR_ROLE } from "./roles.js";

export default async function handleEvent(
  args: EventHandlerArgs<
    Indexer,
    "AlloV1/ProgramFactory/V1" | "AlloV2/Registry/V1",
    "RoleRevoked"
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
              type: "DeleteAllProjectRolesByRoleAndAddress",
              projectRole: {
                chainId,
                projectId: programAddress,
                role: "owner",
                address: account,
              },
            },
          ];
        }

        case PROGRAM_OPERATOR_ROLE: {
          return [
            {
              type: "DeleteAllProjectRolesByRoleAndAddress",
              projectRole: {
                chainId,
                projectId: programAddress,
                role: "member",
                address: account,
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
