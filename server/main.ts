/* eslint-disable react-hooks/rules-of-hooks */
import express from "express";
import * as crypto from "crypto";
import { specifiedRules, ExecutionArgs } from "graphql";
import * as http from "http";
import { Server as WSServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import { InMemoryLiveQueryStore } from "@n1ru4l/in-memory-live-query-store";
import { NoLiveMixedWithDeferStreamRule } from "@n1ru4l/graphql-live-query";
import cors from "cors";
import { schema as _schema } from "./schema";
import { getGraphQLParameters, processRequest } from "graphql-helix";
import { Server as IOServer } from "socket.io";
import { registerSocketIOGraphQLServer } from "@n1ru4l/socket-io-graphql-server";
import { envelop, useLogger, useSchema } from "@envelop/core";
import {
  useExtendedValidation,
  OneOfInputObjectsRule,
} from "@envelop/extended-validation";
import { createPubSub } from "./pubsub";

const { schema, execute, subscribe, validate, parse } = envelop({
  plugins: [
    useSchema(_schema),
    useLogger(),
    useExtendedValidation({ rules: [OneOfInputObjectsRule] }),
  ],
})();

const app = express();

const pubSub = createPubSub<{
  randomHash: string;
}>();

const liveQueryStore = new InMemoryLiveQueryStore({ execute });

// small live query demonstration setup
// we mutate the array and invalidate it every second so a new result is sent to the clients.
const greetings = ["Hello", "Hi", "Ay", "Sup"];
const shuffleGreetingsInterval = setInterval(() => {
  const firstElement = greetings.pop();
  greetings.unshift(firstElement!);
  liveQueryStore.invalidate("Query.greetings");
}, 1000);

const randomHashInterval = setInterval(() => {
  pubSub.publish("randomHash", crypto.randomBytes(20).toString("hex"));
}, 1000);

const contextValue = {
  greetings,
  pubSub,
};

const validationRules = [...specifiedRules, NoLiveMixedWithDeferStreamRule];

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
    contextFactory: () => contextValue,
    execute: liveQueryStore.execute,
    subscribe,
    parse,
    validate,
    validationRules,
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
    return;
  }

  if (result.type === "MULTIPART_RESPONSE") {
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

    // We can assume a part be sent, either error, or payload;
    res.write("---");

    // Subscribe and send back each result as a separate chunk. We await the subscribe
    // call. Once we're done executing the request and there are no more results to send
    // to the client, the Promise returned by subscribe will resolve and we can end the response.
    await result.subscribe((result) => {
      const chunk = Buffer.from(JSON.stringify(result), "utf8");
      const data = [
        "",
        "Content-Type: application/json; charset=utf-8",
        "",
        chunk,
      ];
      if (result.hasNext) {
        data.push("---");
      }
      res.write(data.join("\r\n"));
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

const httpServer = app.listen(PORT, () => {
  console.log(`GraphQL Server listening on port ${PORT}.`);
});

const wsServer = new WSServer({
  server: httpServer,
  path: "/graphql",
});

// eslint-disable-next-line react-hooks/rules-of-hooks
const graphqlWs = useServer(
  {
    execute: liveQueryStore.execute,
    subscribe,
    onSubscribe: (_, msg) => {
      const args: ExecutionArgs = {
        schema,
        operationName: msg.payload.operationName,
        document:
          typeof msg.payload.query === "object"
            ? msg.payload.query
            : parse(msg.payload.query),
        variableValues: msg.payload.variables,
        contextValue,
      };

      // don't forget to validate when returning custom execution args!
      const errors = validate(args.schema, args.document, validationRules);
      if (errors.length > 0) {
        return errors; // return `GraphQLError[]` to send `ErrorMessage` and stop subscription
      }

      return args;
    },
    onError: (_, err) => {
      console.error(err);
    },
  },
  wsServer
);

// We also spin up a Socket.io server that serves the GraphQL schema

const socketIoHttpServer = http.createServer();
const ioServer = new IOServer(socketIoHttpServer, {
  cors: {
    origin: "*",
  },
});

registerSocketIOGraphQLServer({
  socketServer: ioServer,
  getParameter: () => ({
    execute: liveQueryStore.execute,
    subscribe,
    parse,
    validate,
    // Overwrite validate and use our custom validation rules.
    validationRules,
    graphQLExecutionParameter: {
      schema,
      contextValue,
    },
  }),
});

socketIoHttpServer.listen(4001);

process.once("SIGINT", () => {
  clearInterval(shuffleGreetingsInterval);
  clearInterval(randomHashInterval);
  console.log("Received SIGINT. Shutting down HTTP and Websocket server.");
  graphqlWs.dispose();
  httpServer.close();
  ioServer.close();
  socketIoHttpServer.close();
});
