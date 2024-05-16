# Reindexing

## Deployment Considerations

When deploying changes to the indexer, it's important to clarify the results you want to achieve:

1. **Applying Changes to New Blocks Only**:
    - If you want your changes to apply only to new blocks, simply deploy your changes. The indexer will resume indexing from the last indexed block without affecting previously indexed data. Migrations will not be applied retroactively.

2. **Changing Database Schema or Event Handlers Retroactively**:
    - If you need to change the database schema or modify event handlers for previously indexed blocks, you must increment the `CHAIN_DATA_VERSION` constant in `src/config.ts`.
    - The indexer will create a new schema in Postgres named `chain_data_${version}`. If this schema does not exist, it will be created, all necessary tables will be set up, and indexing will start from scratch.
    - If the schema already exists, the indexer will resume indexing from the last indexed block unless the `--drop-db` flag is specified via the CLI. This will drop the existing database and start fresh.

### Using `--drop-db` in Development

- During development, you can use the `--drop-db` flag to ensure the indexer always deletes the existing schema and migrates from scratch. This can be useful for testing schema changes and event handler modifications without retaining old data.

### Important Notes

- **Reindexing Time**: Deployments involving reindexing will take significantly longer. Plan accordingly to minimize downtime or performance impact.
- **Reindexing Monitoring:** Make sure that you monitor reindexing progress through DataDog.
