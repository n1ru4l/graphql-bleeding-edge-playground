import {
  DirectiveLocation,
  GraphQLBoolean,
  GraphQLDirective,
  GraphQLID,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  InputObjectTypeDefinitionNode,
  parse,
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

const GraphQLOneOfInputObject = new GraphQLInputObjectType({
  name: "GraphQLOneOfInput",
  fields: {
    byId: {
      type: GraphQLID,
    },
    byName: {
      type: GraphQLString,
    },
  },
  astNode: parse(/* GraphQL */ `
    input GraphQLOneOfInput @oneOf {
      byId: ID
      byName: String
    }
  `).definitions[0] as InputObjectTypeDefinitionNode,
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
    oneOfTest: {
      type: GraphQLBoolean,
      args: {
        input: {
          type: GraphQLNonNull(GraphQLOneOfInputObject),
        },
      },
      resolve: () => true,
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
      subscribe: (_, __, context) => context.pubSub.subscribe("randomHash"),
    },
  },
});

const GraphQLOneOfDirective = new GraphQLDirective({
  name: "oneOf",
  locations: [
    DirectiveLocation.FIELD_DEFINITION,
    DirectiveLocation.INPUT_OBJECT,
  ],
  description:
    "Only one field of a type that is annotated with oneOf can resolve to a value.",
});

export const schema = new GraphQLSchema({
  query: Query,
  mutation: Mutation,
  subscription: Subscription,
  directives: [
    ...specifiedDirectives,
    GraphQLLiveDirective,
    GraphQLOneOfDirective,
  ],
});
