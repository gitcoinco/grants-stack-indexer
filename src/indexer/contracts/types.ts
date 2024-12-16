import { EventHandlerArgs } from "chainsauce";
import { Changeset } from "#database/index.js";
import { Indexer } from "#indexer/indexer.js";

export interface EventHandler {
  (args: EventHandlerArgs<Indexer>): Promise<Changeset[]>;
}

export interface Contract {
  abi?: any;
  handlers?: { [eventName: string]: EventHandler };
}

export interface NameContracts {
  [version: string]: Contract;
}

export interface ProtocolContracts {
  [name: string]: NameContracts;
}

export interface Contracts {
  [protocol: string]: ProtocolContracts;
}
