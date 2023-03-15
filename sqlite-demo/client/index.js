import { createDbWorker } from "sql.js-httpvfs";

// sadly there's no good way to package workers and wasm directly so you need a way to get these two URLs from your bundler.
// This is the webpack5 way to create a asset bundle of the worker and wasm:
const workerUrl = new URL(
  "sql.js-httpvfs/dist/sqlite.worker.js",
  import.meta.url
);
const wasmUrl = new URL("sql.js-httpvfs/dist/sql-wasm.wasm", import.meta.url);

const config = {
  from: "inline",
  config: {
    serverMode: "full", // file is just a plain old full sqlite database
    requestChunkSize: 4096, // the page size of the  sqlite database (by default 4096)
    url: "http://localhost:4000/index.db", // url to the database (relative or full)
  },
};

let maxBytesToRead = 10 * 1024 * 1024;

setInterval(async () => {
  const worker = await createDbWorker(
    [config],
    workerUrl.toString(),
    wasmUrl.toString(),
    maxBytesToRead // optional, defaults to Infinity
  );
  const result = await worker.db.exec(`select count(id) from projects;`);
  console.log(result[0].values[0]);
}, 1000);
