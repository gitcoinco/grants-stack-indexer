import { EventHandlerArgs } from "chainsauce";
import type { Indexer } from "../../indexer.js";
import { Changeset } from "../../../database/index.js";

export async function handleMigratedEvent(
  args: EventHandlerArgs<Indexer>
): Promise<Changeset[]> {
  const {
    chainId,
    event,
    subscribeToContract,
    readContract,
    getBlock,
    context: { db, rpcClient, ipfsGet, logger },
  } = args;

  switch (event.name) {
    // -- Migrated Events --
    case "ProfileMigrated": {
      const alloV1ProfileId = event.params.alloV1;
      const alloV1ChainId = event.params.alloV1ChainId;
      const alloV2ProfileId = event.params.alloV2;

      const alloV1Project = await db.getProjectById(alloV1ChainId, alloV1ProfileId);

      // Get All Applications from alloV1Project
      const applications = await db.getApplicationsByProjectId(
        chainId,
        alloV1ProfileId
      );

      let changeSet: Changeset[] = [];

      applications.forEach((application) => {

        // Create New Application for alloV2Project
        const migratedApplication = { ...application };
        
        migratedApplication.projectId = alloV2ProfileId;
        // CALLOUT: This creates a confusion as we may have an application
        // from allo v1 in optimism while the allo-v2 project is on arbitrum 
        // while the linked project is not created on optimism 
        // (cause syncing has not happened).
        migratedApplication.tags = [
          "allo-v2",
          "migrated-from-v1"
        ];
        
        changeSet.push({
          type: "InsertApplication",
          application: migratedApplication,
        });
      });

      return changeSet;
    }

   
  }

  return [];
}