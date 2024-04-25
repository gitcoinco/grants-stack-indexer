# Deploy to Fly

Follow the [instructions to install the flyctl](https://fly.io/docs/hands-on/install-flyctl/).

Clone the repository and tweak the `fly.toml`.

1. Set `INDEXED_CHAINS` to the chains you're interested in, check `src/config.ts` to see what chains are supported.
2. We recommend setting your own RPCs as the public ones have very low rate limits and indexing will probably fail

Once you're happy with the configuration, run the following command, it will provision an app and deploy it:

```sh
fly launch
```

The first run might take a while, run `fly logs` to see what's going on.
