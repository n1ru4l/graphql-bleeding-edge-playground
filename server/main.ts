import express from "express";
import { execute, subscribe } from "graphql";
import { graphqlHTTP } from "express-graphql";
import { createServer } from "graphql-ws";
import cors from "cors";
// @ts-ignore
import { schema } from "./schema";

const app = express();

app.use(cors());
app.use(
  "/graphql",
  graphqlHTTP({
    schema,
    graphiql: false,
  })
);

const PORT = 4000;

const server = app.listen(PORT, () => {
  console.log(`GraphQL Server listening on port ${PORT}.`);
});

const websocketGraphQLServer = createServer(
  {
    schema,
    execute,
    subscribe,
  },
  {
    server,
    path: "/graphql",
  }
);

process.once("SIGINT", () => {
  console.log("Received SIGINT. Shutting down HTTP and Websocket server.");
  websocketGraphQLServer.dispose();
  server.close();
});
