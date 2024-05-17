# Caching

## Overview

Caching allows us to optimize performance and reduce redundant operations. We have multiple caching mechanisms for different data.

### Types of Caches

1. **Chainsauce Cache**
   - We use the Chainsauce cache from [github.com/boudra/chainsauce](https://github.com/boudra/chainsauce), which caches contract events, contract reads, and block data. This cache is stored in SQLite on disk, reducing the need for redundant blockchain interactions and speeding up data retrieval processes.

2. **IPFS Cache**
   - Data fetched from IPFS is cached on disk using `make-fetch-happen`. This ensures that we avoid repeated network calls, providing faster access to IPFS resources and reducing bandwidth usage.

3. **CoinGecko HTTP Calls Cache**
   - HTTP calls to the CoinGecko API are also cached on disk via `make-fetch-happen`. This minimizes repeated API calls and improves the performance of our application by reducing the latency of fetching exchange rates and other cryptocurrency data.

### Cache Storage Location

- **Production**: In production, all caches are stored in `/mnt/indexer/cache`. 
- **Development**: In development, caches are stored inside `.var/cache` in the indexer working directory.

## Potential Improvements

1. **Integrating All Caches Inside the SQLite Database**:
   - By integrating all caches into the SQLite database, we can make the cache portable. Users deploying their own indexers can pull the cache from S3 and start with a warm cache, significantly speeding up indexing time.

2. **Moving the Cache to PostgreSQL**:
   - Moving the cache to PostgreSQL would allow it to be shared by all instances of the application. Portability could be achieved using `pgdump`, enabling users to transfer the cache easily and maintain consistency across different deployments.
