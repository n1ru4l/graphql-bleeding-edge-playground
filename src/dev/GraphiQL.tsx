import React from "react";
import {
  GraphiQL as DefaultGraphiQL,
  FetcherParams,
  FetcherResult,
} from "graphiql";
import "graphiql/graphiql.css";
import { createClient } from "graphql-ws";
import { meros } from "meros/browser";
import { Subscription as SSESubscription } from "sse-z";
import { io } from "socket.io-client";
import { isLiveQueryOperationDefinitionNode } from "@n1ru4l/graphql-live-query";
import { createSocketIOGraphQLClient } from "@n1ru4l/socket-io-graphql-client";
import {
  makeAsyncIterableIteratorFromSink,
  isAsyncIterable,
} from "@n1ru4l/push-pull-async-iterable-iterator";
import { parse, getOperationAST } from "graphql";
import type { GraphQLError } from "graphql";
import { ToolbarButton } from "graphiql/dist/components/ToolbarButton";
import "./custom-graphiql.css";

const ioClient = io("http://localhost:4001");
const ioGraphQLClient = createSocketIOGraphQLClient<FetcherResult>(ioClient);

const ioFetcher = (graphQLParams: FetcherParams) =>
  ioGraphQLClient.execute({ ...graphQLParams, operation: graphQLParams.query });

const wsClient = createClient({
  url: import.meta.env.VITE_WS_URL,
  lazy: false,
});

const httpMultipartFetcher = async (
  graphQLParams: FetcherParams
): Promise<any> => {
  const abortController = new AbortController();

  const parsedDocument = parse(graphQLParams.query);
  const operationName = graphQLParams.operationName;

  const documentNode = getOperationAST(parsedDocument, operationName);
  if (
    documentNode!.operation === "subscription" ||
    isLiveQueryOperationDefinitionNode(documentNode!)
  ) {
    const searchParams: Record<string, string> = {
      operationName: graphQLParams.operationName,
      query: graphQLParams.query,
    };
    if (graphQLParams.variables) {
      searchParams.variables = JSON.stringify(graphQLParams.variables);
    }

    return makeAsyncIterableIteratorFromSink<FetcherResult>((sink) => {
      const subscription = new SSESubscription({
        url: import.meta.env.VITE_GRAPHQL_SERVER_URL,
        searchParams,
        onNext: (value) => {
          sink.next(JSON.parse(value));
        },
        onError: sink.error,
        onComplete: sink.complete,
      });

      return () => subscription.unsubscribe();
    });
  }

  const patches = await fetch(import.meta.env.VITE_GRAPHQL_SERVER_URL, {
    method: "POST",
    body: JSON.stringify(graphQLParams),
    headers: {
      accept: "application/json, multipart/mixed",
      "content-type": "application/json",
    },
    signal: abortController.signal,
  }).then((r) => meros<FetcherResult>(r));

  if (isAsyncIterable(patches)) {
    return multiResponseParser(patches);
  }

  return patches.json();
};

async function* multiResponseParser<T>(
  iterator: AsyncIterableIterator<{
    body: T;
    json: boolean;
  }>
) {
  for await (const { body, json } of iterator) {
    if (!json) {
      throw new Error("failed parsing part as json");
    }
    yield body;
  }
}

const wsFetcher = (graphQLParams: FetcherParams) =>
  makeAsyncIterableIteratorFromSink<any>((sink) =>
    wsClient.subscribe(graphQLParams, {
      ...sink,
      error: (err) => {
        if (err instanceof Error) {
          sink.error(err);
        } else if (err instanceof CloseEvent) {
          sink.error(
            new Error(
              `Socket closed with event ${err.code} ${err.reason || ""}`.trim()
            )
          );
        } else {
          sink.error(
            new Error(
              (err as GraphQLError[]).map(({ message }) => message).join(", ")
            )
          );
        }
      },
    })
  );

const defaultQuery = /* GraphQL */ `
  #
  # Query
  #
  # This is just a simple query - nothing to special here.
  # But note that you can execute it via WebSocket, HTTP and Socket.io
  #
  query PingQuery {
    ping
  }

  #
  # Mutation
  #
  # This is just a simple query - nothing to special here.
  # But note that you can execute it via WebSocket, HTTP and Socket.io
  #
  mutation PingMutation {
    ping
  }

  #
  # Subscription backed by a AsyncGenerator function
  #
  subscription CountTestSubscription {
    # This subscription will emit 10 events over the time span of 10 seconds before completing.
    count(to: 10)
  }

  #
  # Subscription backed by Node.js EventEmitter
  #
  subscription RandomHashTestSubscription {
    # a new value is published in 1 second intervals
    randomHash
  }

  #
  # Query using @defer
  #
  # defer can be used on fragments in order to defer sending a part of the result to the client,
  # if it takes longer than the rest of the resolvers to yield an value.
  #
  # @defer is useful when a certain resolver on your backend is slow, but not mandatory for showing something meaningful to your users.
  # An example for this would be a slow database call or third-party service.
  #
  query DeferTestQuery {
    deferTest {
      name
      # The defer directive on fragments allows specifying that we are fine with
      # getting the data requirement defined in that fragment later (if it is not available immediately)
      ... on GraphQLDeferTest @defer {
        # this field has a sleep(5000) call,
        # which means it will take a long time until it will be resolved
        deferThisField
      }
    }
  }

  #
  # Query using stream
  #
  # stream can be used on fields that return lists.
  # The resolver on the backend uses an async generator function for yielding the values.
  #
  # This allows slow/huge lists of data to be streamed to the client. While data is still coming in the client can already show UI.
  # Handy for feed like views.
  #
  query StreamTestQuery {
    #
    # With the initialCount argument we can specify the minimum required items that should be sent initially.
    # the remaining items will then be streamed once they are ready to be sent over the wire.
    streamTest @stream(initialCount: 2)
  }

  #
  # Query using @live
  #
  # This one is highly experimental and there is no RFC ongoing.
  # The live directive specifies that the client wants to always wants to have the latest up to date data streamed.
  #
  # The implementation tracks the resources a client consumes and re-executes the query operation once one of those got stale/invalidated.
  # Check out https://github.com/n1ru4l/graphql-live-query for more information.
  #
  # This example returns a list that is mutated and invalidated each second.
  #
  query LiveTestQuery @live {
    # this field returns a list of greetings whose items are shuffled
    greetings
  }

  #
  # OneOf input types
  #
  # OneOf input types allow polymorphic input fields. They are currently in the RFC stage. https://github.com/graphql/graphql-spec/pull/825
  # The @envelop/extended-validation plugin allows using the feature today! https://github.com/dotansimha/envelop/tree/main/packages/plugins/extended-validation
  #
  # The input type LogEvent type is marked as a oneOf type. Therefore, the validation of the operation only passes if the input has either a stringEvent or booleanEvent key.
  # Providing both or neither would result in a validation error.
  #
  # Let's provide a string as the input
  mutation OneOfStringInputMutation {
    logEvent(input: {
      stringEvent: "hey"
    })
  }
  # Let's provide a boolean as the input
  mutation OneOfBooleanInputMutation {
    logEvent(input: {
      booleanEvent: true
    })
  }
  # Uncomment and execute this query and you will encounter a validation error.
  # mutation OneOfInvalidInputMutation {
  #   logEvent(input: {
  #     stringEvent: "hey"
  #     booleanEvent: true
  #   })
  # }
`
  .split(`\n`)
  .slice(1)
  .map((line) => line.replace("  ", ""))
  .join(`\n`);

export const GraphiQL = () => {
  const [activeTransportIndex, setActiveTransportIndex] = React.useState(0);

  const fetcherOptions: ToolbarDropDownOption[] = React.useMemo(
    () => [
      {
        value: "ws",
        label: "GraphQL over WS",
        title: "GraphQL over WS",
      },
      {
        value: "http",
        label: "GraphQL over HTTP",
        title: "GraphQL over HTTP",
      },
      {
        value: "Socket.io",
        label: "GraphQL over Socket.io",
        title: "GraphQL over Socket.io",
      },
    ],
    []
  );

  const activeTransport = (
    fetcherOptions[activeTransportIndex] ?? fetcherOptions[0]
  ).value;

  const fetcher =
    activeTransport === "ws"
      ? wsFetcher
      : activeTransport === "http"
      ? httpMultipartFetcher
      : ioFetcher;

  return (
    <div style={{ height: "100vh" }}>
      <DefaultGraphiQL
        defaultQuery={defaultQuery}
        fetcher={fetcher}
        toolbar={{
          additionalContent: (
            <>
              <div className="toolbar-label">Transport</div>
              <ToolbarDropDown
                options={fetcherOptions}
                activeOptionIndex={activeTransportIndex}
                onSelectOption={setActiveTransportIndex}
              />
            </>
          ),
        }}
        // ensure that the defaultQuery is always used by disabling storage
        storage={{
          getItem: () => null,
          removeItem: () => undefined,
          setItem: () => undefined,
          length: 0,
        }}
      />
    </div>
  );
};

type ToolbarDropDownOption = {
  title: string;
  label: string;
  value: string;
};

const ToolbarDropDown = (props: {
  options: ToolbarDropDownOption[];
  activeOptionIndex: number;
  placeholder?: string;
  onSelectOption: (optionIndex: number) => void;
}): React.ReactElement => {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedOption = props.options[props.activeOptionIndex] ?? null;

  return (
    <div className="toolbar-drop-down">
      <ToolbarButton
        title={selectedOption?.title ?? props.placeholder ?? "Select value"}
        label={selectedOption?.label ?? props.placeholder ?? "Select Value"}
        onClick={() => {
          setIsOpen((isOpen) => !isOpen);
        }}
      />
      {isOpen ? (
        <ToolbarDropDownMenu>
          {props.options.map((item, index) => (
            <ToolbarDropDownMenuItem
              key={item.value}
              item={item}
              isActive={index === props.activeOptionIndex}
              onClick={() => {
                props.onSelectOption(index);
                setIsOpen(false);
              }}
            />
          ))}
        </ToolbarDropDownMenu>
      ) : null}
    </div>
  );
};

const ToolbarDropDownMenu = (props: {
  children: React.ReactNode;
}): React.ReactElement => {
  return <div className="toolbar-drop-down-menu">{props.children}</div>;
};

const ToolbarDropDownMenuItem = (props: {
  item: ToolbarDropDownOption;
  isActive: boolean;
  onClick: () => void;
}): React.ReactElement => {
  return (
    <button
      className="toolbar-drop-down-menu-item"
      title={props.item.title}
      onClick={props.onClick}
    >
      {props.item.label}
    </button>
  );
};