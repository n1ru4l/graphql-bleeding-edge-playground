import React from "react";
import { GraphiQL as DefaultGraphiQL } from "graphiql";
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
import { ToolbarButton } from "graphiql/dist/components/ToolbarButton";
import "./custom-graphiql.css";
import {
  FetcherParams,
  FetcherResult,
} from "graphiql/dist/components/GraphiQL";

const ioClient = io("http://localhost:4001");
const ioGraphQLClient = createSocketIOGraphQLClient<FetcherResult>(ioClient);

const ioFetcher = (graphQLParams: FetcherParams) =>
  ioGraphQLClient.execute({ ...graphQLParams, operation: graphQLParams.query });

const wsClient = createClient({
  url: "ws://localhost:4000/graphql",
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
        url: "http://localhost:4000/graphql",
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

  const patches = await fetch("http://localhost:4000/graphql", {
    method: "POST",
    body: JSON.stringify(graphQLParams),
    headers: {
      accept: "application/json, multipart/mixed",
      "content-type": "application/json",
    },
    signal: abortController.signal,
  }).then(r => meros<FetcherResult>(r));

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
    wsClient.subscribe(graphQLParams, sink)
  );

const defaultQuery = /* GraphQL */ `
  #
  # Simple ping query, nothing special here.
  #
  query PingQuery {
    ping
  }

  #
  # Simple ping mutation, nothing special here.
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
  # Here things get interesting ;)
  # Let's learn a bit about defer!
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
  # There is also the @stream directive which is handy for lists that take a long time to retrieve.
  #
  query StreamTestQuery {
    #
    # With the initialCount argument we can specify the minimum required items that should be sent initially.
    # the remaining items will then be streamed once they are ready to be sent over the wire.
    streamTest @stream(initialCount: 2)
  }

  #
  # This one is highly experimental and there is no RFC ongoing.
  # The live directive specifies that the client wants to be notified in case any data the query selects has changed
  # Check out https://github.com/n1ru4l/graphql-live-query for more information.
  query LiveTestQuery @live {
    # this field returns a list of greetings whose items are shuffled
    greetings
  }
`;

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
