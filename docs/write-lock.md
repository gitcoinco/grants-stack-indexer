# Indexer Write Lock Mechanism

### Exclusive Indexing

- **Write Lock**: The indexing process is exclusive, meaning only one indexer can write at any given time. This prevents data corruption by ensuring that simultaneous writes do not occur.
- **High Availability**: The locking mechanism also facilitates high availability. If the active indexer crashes, another indexer can acquire the lock and continue indexing.

### Deployment Strategy

1. **Two Indexers Running**:
   - We have two indexers running concurrently. One indexer actively holds the write lock and performs indexing, while the other remains on standby, ready to take over if the active indexer fails.

2. **Fly Rolling Deployment**:
   - When deploying updates, we use the fly rolling strategy. This process updates one instance at a time:
     - First, it updates one indexer. If the update is successful, it then updates the second indexer.
     - This ensures continuous service availability during deployments.

3. **Reindexing Process**:
   - When reindexing (writing to a new schema), the old indexer continues to update the old schema, while the new indexer writes to the new schema.
   - Since they write to different schemas, this allows the web service to keep serving data from the old schema while the new indexer performs reindexing.
   - This separation ensures a zero-downtime upgrade, as the reindexing process can take a significant amount of time.
