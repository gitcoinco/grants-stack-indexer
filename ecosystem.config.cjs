module.exports = {
  apps: [
    {
      name: "web",
      script: "npm",
      args: "start -- --http --http-wait-for-sync=false",
    },
    {
      name: "indexer",
      script: "npm",
      args: "start -- --indexer --http",
    },
  ],
};
