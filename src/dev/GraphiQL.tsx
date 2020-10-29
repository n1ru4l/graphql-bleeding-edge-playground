import React, { ComponentProps } from "react";
import { GraphiQL as DefaultGraphiQL } from "graphiql";
import "graphiql/graphiql.css";
import { createClient } from "graphql-ws";
import fetchMultipart from "fetch-multipart-graphql";
import { ToolbarButton } from "graphiql/dist/components/ToolbarButton";

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

const httpFetcher: Fetcher = (graphQLParams) =>
  ({
    subscribe: (...args: SubscribeArguments) => {
      const abortController = new AbortController();
      const sink = getSinkFromArgs(args);

      fetch("http://localhost:4000/graphql", {
        method: "POST",
        body: JSON.stringify(graphQLParams),
        headers: {
          "content-type": "application/json",
        },
        signal: abortController.signal,
      })
        .then((res) => res.json())
        .then((res: unknown) => {
          sink.next(res);
          sink.complete();
        })
        .catch((err) => sink.error(err));

      return {
        unsubscribe: () => abortController.abort(),
      };
    },
  } as any);

const httpMultipartFetcher: Fetcher = (graphQLParams) =>
  ({
    subscribe: (...args: SubscribeArguments) => {
      const sink = getSinkFromArgs(args);
      const isIntrospectionQuery = args.length === 3;

      fetchMultipart("http://localhost:4000/graphql", {
        method: "POST",
        body: JSON.stringify(graphQLParams),
        headers: {
          "content-type": "application/json",
        },
        onNext: (parts) => {
          // Introspection is broken if we return a array instead of a single item.
          // TODO: This should be addressed inside GraphiQL
          sink.next(isIntrospectionQuery ? parts[0] : parts);
        },
        onError: sink.error,
        onComplete: sink.complete,
      });

      return { unsubscribe: () => undefined };
    },
  } as any);

const wsFetcher: Fetcher = (graphQLParams) =>
  ({
    subscribe: (...args: SubscribeArguments) => {
      const sink = getSinkFromArgs(args);
      const unsubscribe = wsClient.subscribe(
        {
          ...graphQLParams,
          // graphql-ws throws otherwise...
          variables: graphQLParams || {},
        },
        {
          next: sink.next,
          complete: sink.complete,
          error: sink.error,
        }
      );

      return { unsubscribe };
    },
  } as any);

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

# only works with the ws transport :)
query greetings @live {
  greetings
}
`;

export const GraphiQL = () => {
  const [transport, setTransport] = React.useState(
    "http" as "http" | "multipart-http" | "ws"
  );

  const fetcher =
    transport === "ws"
      ? wsFetcher
      : transport === "multipart-http"
      ? httpMultipartFetcher
      : httpFetcher;

  return (
    <div style={{ height: "100vh" }}>
      <DefaultGraphiQL
        defaultQuery={defaultQuery}
        fetcher={fetcher}
        additionalButtons={[
          <ToolbarButton
            title={
              transport === "ws"
                ? "Use HTTP Transport"
                : transport === "http"
                ? "Use HTTP Multipart Transport"
                : "Use WS Transport"
            }
            label={
              transport === "ws"
                ? "Use HTTP Transport"
                : transport === "http"
                ? "Use HTTP Multipart Transport"
                : "Use WS Transport"
            }
            onClick={() =>
              setTransport((transport) =>
                transport === "ws"
                  ? "http"
                  : transport === "http"
                  ? "multipart-http"
                  : "ws"
              )
            }
          />,
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
