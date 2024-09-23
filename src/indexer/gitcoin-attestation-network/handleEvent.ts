import { EventHandlerArgs } from "chainsauce";
import { Hex, decodeAbiParameters } from "viem";
import { parseAddress } from "../../address.js";
import { Changeset } from "../../database/index.js";
import type { Indexer } from "../indexer.js";
import {
  AttestationMetadata,
  AttestationTxnData,
  GitcoinAttestedData,
} from "../types.js";
import { getDateFromTimestamp } from "../../utils/index.js";
import { AttestationTable } from "../../database/schema.js";

function decodeAttestedData(encodedData: Hex) {
  const decodedData = decodeAbiParameters(
    [
      { name: "projectsContributed", type: "uint64" },
      { name: "roundsCountributed", type: "uint64" },
      { name: "chainIdsContributed", type: "uint64" },
      { name: "totalUSDAmount", type: "uint128" },
      { name: "timestamp", type: "uint64" },
      { name: "metadataCid", type: "string" },
    ],
    encodedData
  );

  const results: GitcoinAttestedData = {
    projectsContributed: decodedData[0],
    roundsCountributed: decodedData[1],
    chainIdsContributed: decodedData[2],
    totalUSDAmount: decodedData[3],
    timestamp: decodedData[4],
    metadataCid: decodedData[5],
  };

  return results;
}

export async function handleEvent(
  args: EventHandlerArgs<Indexer>
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    context: { ipfsGet, logger },
  } = args;

  switch (event.name) {
    case "OnAttested": {
      const attestationId = event.params.uid;
      const recipient = parseAddress(event.params.recipient);
      const fee = event.params.fee;
      const refUID = event.params.refUID;

      const decodedAttestationData = decodeAttestedData(event.params.data);

      let data: AttestationMetadata[] = [];
      try {
        data = (await ipfsGet(decodedAttestationData.metadataCid)) ?? [];
      } catch (e) {
        logger.warn({
          msg: `OnAttested: Failed to fetch metadata for attestation ${attestationId}`,
          event,
          decodedAttestationData,
        });
        return [];
      }

      const transactionsData: AttestationTxnData[] = [];
      for (let i = 0; i < data.length; i++) {
        const metadata = data[i];

        transactionsData.push({
          chainId: metadata.chainId,
          txnHash: metadata.txnHash,
        });
      }

      const attestationData: AttestationTable = {
        uid: attestationId,
        chainId: chainId,
        recipient: recipient,
        fee: fee,
        refUID: refUID,
        projectsContributed: decodedAttestationData.projectsContributed,
        roundsContributed: decodedAttestationData.roundsCountributed,
        chainIdsContributed: decodedAttestationData.chainIdsContributed,
        totalUSDAmount: decodedAttestationData.totalUSDAmount,
        timestamp: getDateFromTimestamp(decodedAttestationData.timestamp),
        metadataCid: decodedAttestationData.metadataCid,
        metadata: JSON.stringify(data),
      };

      const changes: Changeset[] = [
        {
          type: "InsertAttestation",
          attestation: {
            attestationData,
            transactionsData,
          },
        },
      ];

      return changes;
    }
  }

  return [];
}
