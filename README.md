# Experimental GraphQL Playground

Demonstration of experimental GraphQL features with (experimental) `express-http` and (experimental) `graphql-ws`. Test the bleeding edge with less hazzle.

Showcasing the following features with Fetcher implementations on GraphiQL:

- Query (HTTP, HTTP-Multipart, WebSocket)
- Mutation (HTTP, HTTP-Multipart, WebSocket)
- Query with @defer (HTTP-Multipart, WebSocket)
- Query with @stream (HTTP-Multipart, WebSocket)
- Live Query (WebSocket)

# Setup instructions

1. clone this repo

2. Make sure you have yarn and node v14 installed

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
