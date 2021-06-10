import App from "express";
import { CreateApp, InferFunctionReturn } from "graphql-ez/express";
import { Server as IOServer } from "socket.io";
import { registerSocketIOGraphQLServer } from "@n1ru4l/socket-io-graphql-server";
import * as crypto from "crypto";
import * as events from "events";
import * as http from "http";
import { InMemoryLiveQueryStore } from "@n1ru4l/in-memory-live-query-store";
import { NoLiveMixedWithDeferStreamRule } from "@n1ru4l/graphql-live-query";
import { schema } from "./schema";
import {
  useExtendedValidation,
  OneOfInputObjectsRule,
} from "@envelop/extended-validation";

const eventEmitter = new events.EventEmitter();
const liveQueryStore = new InMemoryLiveQueryStore();

// small live query demonstration setup
const greetings = ["Hello", "Hi", "Ay", "Sup"];
const shuffleGreetingsInterval = setInterval(() => {
  const firstElement = greetings.pop();
  greetings.unshift(firstElement!);
  liveQueryStore.invalidate("Query.greetings");
}, 1000);

const randomHashInterval = setInterval(() => {
  eventEmitter.emit("randomHash", crypto.randomBytes(20).toString("hex"));
}, 1000);

function buildContext() {
  return {
    greetings,
    eventEmitter,
  };
}

declare module "graphql-ez/express" {
  interface EnvelopContext extends InferFunctionReturn<typeof buildContext> {}
}

export const { registerModule, buildApp } = CreateApp({
  schema,
  buildContext,
  websockets: {
    graphQLWS: true,
    subscriptionsTransport: false,
  },
  ide: {
    altair: false,
    graphiql: false,
  },
  plugins: [
    useExtendedValidation({ rules: [OneOfInputObjectsRule] }),
    /* Live Query Plugin :) */
    {
      onValidate: ({ addValidationRule }) => {
        addValidationRule(NoLiveMixedWithDeferStreamRule);
      },
      onExecute: ({ executeFn, setExecuteFn }) => {
        setExecuteFn(liveQueryStore.makeExecute(executeFn));
      },
    },
  ],
  cors: true,
});

process.once("SIGINT", () => {
  clearInterval(shuffleGreetingsInterval);
  clearInterval(randomHashInterval);
  console.log("Received SIGINT. Shutting down HTTP and Websocket server.");
});

const app = App();

const PORT = 4000;

buildApp({
  app,
}).then((EnvelopApp) => {
  app.use(EnvelopApp.router);

  app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}!`);
  });

  const { parse, validate, subscribe } = EnvelopApp.getEnveloped();

  // // We also spin up a Socket.io server that serves the GraphQL schema

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
      parse,
      validate,
      subscribe,
      graphQLExecutionParameter: {
        schema,
        contextValue: buildContext(),
      },
    }),
  });

  socketIoHttpServer.listen(4001);
});
