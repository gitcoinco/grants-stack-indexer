# Overview

This guide provides instructions on how to clone a source PostgreSQL schema to a target schema, delete specific data for a given chain ID, and subsequently restart the indexer to reindex the removed chain.

## Prerequisites

1. **Node.js and npm installed** (to run the script and manage packages).
2. **PostgreSQL installed and configured**.

## Configuration

Before running the script, ensure you have the following configurations in place:

**Database URL** in the `.env` file:

```
DATABASE_URL=postgres://user:password@localhost:5432/your_database?sslmode=no-verify
```

## Running the Script

1. **Make the script executable**:
    ```bash
    chmod +x cloneSchemaAndCleanChain.sh
    ```

2. **Run the script**:
    ```bash
    ./cloneSchemaAndCleanChain.sh
    ```

    You will be prompted to enter:
    - Source schema number
    - Target schema number
    - Chain ID to delete data for

    Example:
    ```bash
    Enter source schema number: 1
    Enter target schema number: 2
    Enter chain ID to delete data for: 1329
    ```

## Reindexing the Chain

- Open `config.ts` and modify the configuration for the chain data to point to the new target schema.

- After the script has successfully cloned the schema and deleted the data for the specified chain ID, you can start the indexer as usual. The indexer will detect the missing data for the chain ID and begin reindexing it.