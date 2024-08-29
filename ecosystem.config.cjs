module.exports = {
  apps: [
    {
      name: "indexer",
      script: "npm",
      args: "start -- --indexer --http",
    },
  ],
};
