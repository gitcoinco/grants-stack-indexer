import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";
import { parseAddress } from "../../../address.js";
import {
  PROGRAM_ADMIN_ROLE,
  PROGRAM_OPERATOR_ROLE,
  ROUND_ADMIN_ROLE,
  ROUND_OPERATOR_ROLE,
} from "./roles.js";

export default async function handleEvent(
  args: EventHandlerArgs<
    Indexer,
    "AlloV1/ProgramImplementation/V1" | "AlloV2/Registry/V1",
    "RoleRevoked"
  >
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    context: { db, logger },
  } = args;

  switch (args.event.contractName) {
    case "AlloV1/ProgramImplementation/V1": {
      const programAddress = parseAddress(event.address);
      const project = await db.getProjectById(chainId, programAddress);
      if (project === null) {
        logger.warn({
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
          logger.warn({
            msg: `Unknown role ${role} for program ${programAddress}`,
            event,
          });
          return [];
        }
      }
    }

    case "AlloV1/RoundImplementation/V1":
    case "AlloV1/RoundImplementation/V2": {
      const roundAddress = parseAddress(event.address);
      const round = await db.getRoundById(chainId, roundAddress);
      if (round === null) {
        logger.warn({
          msg: `Round ${roundAddress} not found`,
          event,
        });
        return [];
      }

      const account = parseAddress(event.params.account);
      const role = event.params.role.toLocaleLowerCase();

      switch (role) {
        case ROUND_ADMIN_ROLE: {
          return [
            {
              type: "DeleteAllRoundRolesByRoleAndAddress",
              roundRole: {
                chainId,
                roundId: roundAddress,
                role: "admin",
                address: account,
              },
            },
          ];
        }

        case ROUND_OPERATOR_ROLE: {
          return [
            {
              type: "DeleteAllRoundRolesByRoleAndAddress",
              roundRole: {
                chainId,
                roundId: roundAddress,
                role: "manager",
                address: account,
              },
            },
          ];
        }

        default: {
          logger.warn({
            msg: `Unknown role ${role} for program ${roundAddress}`,
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
