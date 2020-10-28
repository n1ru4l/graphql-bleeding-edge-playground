import {
  GraphQLBoolean,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from "graphql";

const Query = new GraphQLObjectType({
  name: "Query",
  fields: {
    ping: {
      type: GraphQLBoolean,
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

const sleep = (t = 1000) => new Promise((res) => setTimeout(res, t));

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
      // resolve is fully optional btw
      resolve: (source) => {
        return (
          source?.count ||
          `You can even execute subscriptions via HTTP.... You should do it with the ws transport instead :)`
        );
      },
      subscribe: async function* (_, args) {
        await sleep();
        for (let i = 1; i <= args.to; i++) {
          yield { count: `ping ${i}` };
          await sleep();
        }
      },
    },
  },
});

export const schema = new GraphQLSchema({
  query: Query,
  mutation: Mutation,
  subscription: Subscription,
});
