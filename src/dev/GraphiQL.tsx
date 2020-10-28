import React, { ComponentProps } from "react";
import { GraphiQL as DefaultGraphiQL } from "graphiql";
import "graphiql/graphiql.css";
import { createClient } from "graphql-ws";
import fetchMultipart from "fetch-multipart-graphql";
import { ToolbarButton } from "graphiql/dist/components/ToolbarButton";

console.log(DefaultGraphiQL);

const wsClient = createClient({
  url: "ws://localhost:4000/graphql",
});

type Fetcher = ComponentProps<typeof DefaultGraphiQL>["fetcher"];

interface Sink<T = unknown> {
  /** Next value arriving. */
  next(value: T): void;
  /** An error that has occured. Calling this function "closes" the sink. */
  error(error: unknown): void;
  /** The sink has completed. This function "closes" the sink. */
  complete(): void;
}

type SubscribeArguments =
  | [next: Sink["next"], complete: Sink["complete"], error: Sink["error"]]
  | [sink: Sink];

const getSinkFromArgs = (args: SubscribeArguments): Sink => {
  if (typeof args[0] === "object") {
    return args[0];
  }
  return {
    next: args[0],
    // @ts-ignore
    complete: args[1],
    // @ts-ignore
    error: args[2],
  } as Sink;
};

const wsFetcher: Fetcher = (graphQLParams) => {
  return {
    subscribe: (...args: SubscribeArguments) => {
      const sink = getSinkFromArgs(args);
      const unsubscribe = wsClient.subscribe(
        {
          ...graphQLParams,
          // graphql-ws throws otherwise...
          variables: graphQLParams || {},
        },
        {
          next: (...args) => {
            sink.next(...args);
          },
          complete: sink.complete,
          error: sink.error,
        }
      );

      return { unsubscribe };
    },
    // @ts-ignore
  } as any;
};

const httpFetcher: Fetcher = (graphQLParams) => {
  return {
    subscribe: (...args: SubscribeArguments) => {
      const sink = getSinkFromArgs(args);

      fetchMultipart("http://localhost:4000/graphql", {
        method: "POST",
        body: JSON.stringify(graphQLParams),
        headers: {
          "content-type": "application/json",
        },
        onNext: (parts) => {
          // TODO: once we have defer and stream we need to add merge logic in here :)
          sink.next(parts[0]);
        },
        onError: sink.error,
        onComplete: sink.complete,
      });

      return { unsubscribe: () => undefined };
    },
    // @ts-ignore
  } as any;
};

const defaultQuery = `

subscription CountSubscription {
  count(to: 10)
}
mutation PingMutation {
  ping
}
query PingQuery {
  ping
}

query DeferTestQuery {
  deferTest {
    name
    ... on GraphQLDeferTest @defer {
      deferThisField
    }
  }
}

query StreamTestQuery {
  streamTest @stream(initialCount: 2)
}
`;

export const GraphiQL = () => {
  const [transport, setTransport] = React.useState("http" as "ws" | "http");

  const fetcher = transport === "ws" ? wsFetcher : httpFetcher;

  return (
    <div style={{ height: "100vh" }}>
      <DefaultGraphiQL
        defaultQuery={defaultQuery}
        fetcher={fetcher}
        additionalButtons={[
          <ToolbarButton
            title={
              transport === "ws" ? "Use HTTP Transport" : "Use WS Transport"
            }
            label={
              transport === "ws" ? "Use HTTP Transport" : "Use WS Transport"
            }
            onClick={() =>
              setTransport((transport) => (transport === "ws" ? "http" : "ws"))
            }
          >
            keke
          </ToolbarButton>,
        ]}
      >
        <DefaultGraphiQL.Footer>
          <div style={{ padding: 8, fontWeight: "bold" }}>
            Currently Using the {transport} transport.
          </div>
        </DefaultGraphiQL.Footer>
      </DefaultGraphiQL>
    </div>
  );
};
