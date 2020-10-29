import express from "express";
import { execute, subscribe } from "graphql";
import { graphqlHTTP } from "express-graphql";
import { createServer } from "graphql-ws";
import { InMemoryLiveQueryStore } from "@n1ru4l/in-memory-live-query-store";
import cors from "cors";
// @ts-ignore
import { schema } from "./schema";

const app = express();

const liveQueryStore = new InMemoryLiveQueryStore({
  execute,
});

// small live query demonstration setup
const greetings = ["Hello", "Hi", "Ay", "Sup"];
const interval = setInterval(() => {
  const firstElement = greetings.pop();
  greetings.unshift(firstElement!);
  liveQueryStore.invalidate("Query.greetings");
}, 1000);

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
    execute: liveQueryStore.execute,
    subscribe,
    context: {
      greetings,
    },
  },
  {
    server,
    path: "/graphql",
  }
);

process.once("SIGINT", () => {
  clearInterval(interval);
  console.log("Received SIGINT. Shutting down HTTP and Websocket server.");
  websocketGraphQLServer.dispose();
  server.close();
});
