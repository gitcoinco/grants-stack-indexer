# Deploy to Fly

We use Fly.io to deploy the indexer. This guide will walk you through the process of setting up and deploying your own indexer on Fly.io.

## Getting Started

First, ensure you have `flyctl` installed by following the [official installation guide](https://fly.io/docs/hands-on/install-flyctl/).

## Configuration

Next, clone the repository and make necessary adjustments to the `fly.toml` file:

1. Adjust `INDEXED_CHAINS` in the configuration to include the chains you want to index. Supported chains can be found in `src/config.ts`.
2. The indexer defaults to using public RPCs. Due to their low rate limits, it's advisable to use private RPCs. Define your RPC URLs in environment variables formatted as `${CHAIN_NAME}_RPC_URL`, such as `OPTIMISM_RPC_URL` for Optimism.

## Deployment

After configuring, deploy your app with the launch command. It will detect the existing `fly.toml` in the repository and make a new app based on that. It will also launch a Postgres database and automatically add the `DATABASE_URL` secret for you.

You might want to specify the `--org` parameter to launch the app in the right organization. Run `fly orgs list` to see the orgs you're part of.

```sh
fly launch --copy-config
```

Monitor the deployment process and troubleshoot if necessary by running:

```sh
fly logs
```

Note that because of the number of events Allo contracts emit, the first run might take hours. Depending on the RPCs, it might even fail. Ensure you monitor progress and update RPCs if necessary.

## Access Your Indexer

Once it's live, Fly will provide a URL where you can access your indexer.
