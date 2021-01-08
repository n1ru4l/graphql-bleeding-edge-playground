import React from "react";
import { GraphiQL as DefaultGraphiQL } from "graphiql";
import "graphiql/graphiql.css";
import { createClient } from "graphql-ws";
import { meros } from "meros/browser";
import { Subscription as SSESubscription } from "sse-z";
import { isLiveQueryOperationDefinitionNode } from "@n1ru4l/graphql-live-query";
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
  }).then(meros);

  if (isAsyncIterable(patches)) {
    return multiResponseParser(patches) as AsyncIterableIterator<FetcherResult>;
  }

  return patches.json();
};

async function* multiResponseParser(
  iterator: AsyncIterableIterator<{
    body: object | string;
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
      next: (next) => {
        sink.next(next);
      },
      complete: sink.complete,
      error: sink.error,
    })
  );

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

# This one uses HTTP SSE or WebSocket
query greetings @live {
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
    ],
    []
  );

  const activeTransport = (
    fetcherOptions[activeTransportIndex] ?? fetcherOptions[0]
  ).value;

  const fetcher = activeTransport === "ws" ? wsFetcher : httpMultipartFetcher;

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
