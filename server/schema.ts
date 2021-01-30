import { on } from "events";
import {
  GraphQLBoolean,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  specifiedDirectives,
} from "graphql";
import { GraphQLLiveDirective } from "@n1ru4l/graphql-live-query";

const sleep = (t = 1000) => new Promise((res) => setTimeout(res, t));

const GraphQLDeferTest = new GraphQLObjectType({
  name: "GraphQLDeferTest",
  fields: {
    name: {
      type: GraphQLString,
      resolve: () => "Peter Parker",
    },
    deferThisField: {
      type: GraphQLString,
      resolve: async () => {
        await sleep(5000);

        return "Took a long time ,he?";
      },
    },
  },
});

const Query = new GraphQLObjectType({
  name: "Query",
  fields: {
    ping: {
      type: GraphQLBoolean,
      resolve: () => true,
    },
    deferTest: {
      type: GraphQLDeferTest,
      resolve: () => ({}),
    },
    streamTest: {
      type: GraphQLList(GraphQLString),
      resolve: async function* () {
        for (const item of ["Hi", "My", "Friend"]) {
          yield item;
          await sleep(1000);
        }
      },
    },
    greetings: {
      type: GraphQLList(GraphQLString),
      resolve: (_, __, context) => context.greetings,
    },
  },
});

const Mutation = new GraphQLObjectType({
  name: "Mutation",
  fields: {
    ping: {
      type: GraphQLBoolean,
      resolve: () => true,
    },
  },
});

const Subscription = new GraphQLObjectType({
  name: "Subscription",
  fields: {
    count: {
      args: {
        to: {
          type: GraphQLNonNull(GraphQLInt),
        },
      },
      type: GraphQLString,
      description:
        "Count to a given number. Implementation Backed by AsyncGenerator function.",
      resolve: (value) => value,
      subscribe: async function* (_, args) {
        for (let i = 1; i <= args.to; i++) {
          yield `${i}`;
          await sleep();
        }
      },
    },
    randomHash: {
      description:
        "Publishes a random hash every second. Backed by Node.js EventEmitter.",
      type: GraphQLString,
      resolve: (value) => value,
      subscribe: async function* (_, __, context) {
        const source = on(context.eventEmitter, "randomHash");
        for await (const [value] of source) {
          // forward value (which is wrapped as an array)
          yield value;
        }
      },
    },
  },
});

export const schema = new GraphQLSchema({
  query: Query,
  mutation: Mutation,
  subscription: Subscription,
  directives: [...specifiedDirectives, GraphQLLiveDirective],
});
