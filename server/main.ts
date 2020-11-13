import express from "express";
import {
  subscribe,
  specifiedRules,
  parse,
  OperationDefinitionNode,
  DefinitionNode,
  validate,
  ExecutionArgs,
} from "graphql";
import { createServer } from "graphql-ws";
import { InMemoryLiveQueryStore } from "@n1ru4l/in-memory-live-query-store";
import {
  NoLiveMixedWithDeferStreamRule,
  isLiveQueryOperationDefinitionNode,
} from "@n1ru4l/graphql-live-query";
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

const isOperationDefinitionNode = (
  definition: DefinitionNode
): definition is OperationDefinitionNode =>
  definition.kind === "OperationDefinition";

const getMainOperationDefinition = (
  definitionNodes: OperationDefinitionNode[],
  name?: string
): OperationDefinitionNode => {
  if (!name && definitionNodes.length > 1) {
    throw new Error("Cannot identify main definition.");
  }
  if (definitionNodes.length === 1) {
    return definitionNodes[0];
  }
  const definitionNode = definitionNodes.find(
    (node) => node.name?.value === name
  );
  if (!definitionNode) {
    throw new Error("Cannot find main definition.");
  }

  return definitionNode;
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
    contextFactory: () => context,
    execute: liveQueryStore.execute,
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

  const documentAST = parse(query!);
  const node = getMainOperationDefinition(
    documentAST.definitions.filter(isOperationDefinitionNode),
    operationName
  );

  if (
    // Live queries should use SSE graphql-helix is currently identifying those as MULTIPART_RESPONSE
    // which is totally fine as they are not part of the specification.
    result.type === "MULTIPART_RESPONSE" &&
    isLiveQueryOperationDefinitionNode(node) === false
  ) {
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
    res.write('---');

    // Subscribe and send back each result as a separate chunk. We await the subscribe
    // call. Once we're done executing the request and there are no more results to send
    // to the client, the Promise returned by subscribe will resolve and we can end the response.
    await result.subscribe((result) => {
      const chunk = Buffer.from(JSON.stringify(result), "utf8");
      const data = ['', 'Content-Type: application/json; charset=utf-8', '', chunk];
      if (result.hasNext) {
        data.push('---');
      }
      res.write(data.join('\r\n'));
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
        contextValue: context,
      };

      // don't forget to validate when returning custom execution args!
      const errors = validate(args.schema, args.document, validationRules);
      if (errors.length > 0) {
        return errors; // return `GraphQLError[]` to send `ErrorMessage` and stop subscription
      }

      return args;
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
