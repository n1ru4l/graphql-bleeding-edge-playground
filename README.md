# Experimental GraphQL Playground

Demonstration of defer/stream/subscriptions/queries/mutations with `express-http`, `graphql-ws`. Test the bleeding egde with less hazzle.

# Setup instructions

1. clone this repo

2. Make sure you have yarn installed

3. Run the `bootstrap.sh` script

```
./bootstrap.sh
```

The bootstrap script will build `express-graphql` and `graphql-js` and link everything.

# Usage

Start the server with `yarn server:start`

Start the frontend `yarn start`

Visit `localhost:3000/__dev__/graphiql`

Execute some operations :)
