import React, { ComponentProps } from "react";
import { GraphiQL as DefaultGraphiQL } from "graphiql";
import "graphiql/graphiql.css";
import { createClient } from "graphql-ws";
import fetchMultipart from "fetch-multipart-graphql";
import { ToolbarButton } from "graphiql/dist/components/ToolbarButton";
import "./custom-graphiql.css";

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
        additionalButtons={[
          <>
            <div className="toolbar-label">Transport</div>
            <ToolbarDropDown
              options={fetcherOptions}
              activeOptionIndex={activeTransportIndex}
              onSelectOption={setActiveTransportIndex}
            />
          </>,
        ]}
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
