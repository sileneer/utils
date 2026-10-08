/* eslint-disable @typescript-eslint/no-require-imports */
require("./database.cjs")
  .migrate()
  .then((db) => {
    db.close();
    require("../server.js");
  })
  .catch(() => {
    console.error("Database startup failed. Server was not started.");
    process.exitCode = 1;
  });
