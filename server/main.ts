import express from "express";
import { subscribe } from "graphql";
import { createServer } from "graphql-ws";
import { InMemoryLiveQueryStore } from "@n1ru4l/in-memory-live-query-store";
import cors from "cors";
import { schema } from "./schema";
import { getGraphQLParameters, processRequest } from "graphql-helix";

const app = express();

const liveQueryStore = new InMemoryLiveQueryStore();

// small live query demonstration setup
const greetings = ["Hello", "Hi", "Ay", "Sup"];
const interval = setInterval(() => {
  const firstElement = greetings.pop();
  greetings.unshift(firstElement!);
  liveQueryStore.invalidate("Query.greetings");
}, 1000);

const context = {
  greetings,
};

app.use(cors());
app.use(express.json());
app.use("/graphql", async (req, res) => {
  // Create a generic Request object that can be consumed by Graphql Helix's API
  const request = {
    body: req.body,
    headers: req.headers,
    method: req.method,
    query: req.query,
  };

  // Extract the GraphQL parameters from the request
  const { operationName, query, variables } = getGraphQLParameters(request);

  // Validate and execute the query
  const result = await processRequest({
    operationName,
    query,
    variables,
    request,
    schema,
    contextFactory: () => context,
    execute: liveQueryStore.execute,
  });

  // processRequest returns one of three types of results depending on how the server should respond
  // 1) RESPONSE: a regular JSON payload
  // 2) MULTIPART RESPONSE: a multipart response (when @stream or @defer directives are used)
  // 3) PUSH: a stream of events to push back down the client for a subscription
  if (result.type === "RESPONSE") {
    // We set the provided status and headers and just the send the payload back to the client
    result.headers.forEach(({ name, value }) => res.setHeader(name, value));
    res.status(result.status);
    res.json(result.payload);
  } else if (result.type === "MULTIPART_RESPONSE") {
    // Indicate we're sending a multipart response
    res.writeHead(200, {
      Connection: "keep-alive",
      "Content-Type": 'multipart/mixed; boundary="-"',
      "Transfer-Encoding": "chunked",
    });

    // If the request is closed by the client, we unsubscribe and stop executing the request
    req.on("close", () => {
      result.unsubscribe();
    });

    // Subscribe and send back each result as a separate chunk. We await the subscribe
    // call. Once we're done executing the request and there are no more results to send
    // to the client, the Promise returned by subscribe will resolve and we can end the response.
    await result.subscribe((result) => {
      const chunk = Buffer.from(JSON.stringify(result), "utf8");
      const data = [
        "",
        "---",
        "Content-Type: application/json; charset=utf-8",
        "Content-Length: " + String(chunk.length),
        "",
        chunk,
        "",
      ].join("\r\n");
      res.write(data);
    });

    res.write("\r\n-----\r\n");
    res.end();
  } else {
    // Indicate we're sending an event stream to the client
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });

    // If the request is closed by the client, we unsubscribe and stop executing the request
    req.on("close", () => {
      result.unsubscribe();
    });

    // We subscribe to the event stream and push any new events to the client
    await result.subscribe((result) => {
      res.write(`data: ${JSON.stringify(result)}\n\n`);
    });
  }
});

const PORT = 4000;

const server = app.listen(PORT, () => {
  console.log(`GraphQL Server listening on port ${PORT}.`);
});

const websocketGraphQLServer = createServer(
  {
    schema,
    execute: liveQueryStore.execute,
    subscribe,
    context,
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
