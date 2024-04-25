# Deploy to Fly

Start by installing `flyctl` using the [official installation guide](https://fly.io/docs/hands-on/install-flyctl/).

Next, clone the repository and modify the `fly.toml` file:

1. Adjust `INDEXED_CHAINS` in the configuration to include the chains you want to index. Supported chains can be found in `src/config.ts`.
2. The indexer defaults to using public RPCs. Due to their low rate limits, it's advisable to use private RPCs. Define your RPC URLs in environment variables formatted as `${CHAIN_NAME}_RPC_URL`. For example, use `OPTIMISM_RPC_URL` for Optimism.

After configuring, deploy your app with:

    fly launch --copy-config

Monitor the deployment process and troubleshoot if necessary by running:

    fly logs

Note that because of the amount of events Allo contracts emit, the first run might take hours.

Once it's live, Fly will provide a URL where you can access your indexer.
