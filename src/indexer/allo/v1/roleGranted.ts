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
    | "AlloV1/ProgramImplementation/V1"
    | "AlloV1/RoundImplementation/V1"
    | "AlloV1/RoundImplementation/V2",
    "RoleGranted"
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
          msg: `Round ${chainId}/${roundAddress} not found`,
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
              type: "InsertRoundRole",
              roundRole: {
                chainId,
                roundId: roundAddress,
                address: account,
                role: "admin",
                createdAtBlock: event.blockNumber,
              },
            },
          ];
        }

        case ROUND_OPERATOR_ROLE: {
          return [
            {
              type: "InsertRoundRole",
              roundRole: {
                chainId,
                roundId: roundAddress,
                address: account,
                role: "manager",
                createdAtBlock: event.blockNumber,
              },
            },
          ];
        }

        default: {
          logger.warn({
            msg: `Unknown role ${role} for round ${roundAddress}`,
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
