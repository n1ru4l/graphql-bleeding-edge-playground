# Experimental GraphQL Playground

Demonstration of experimental GraphQL features with the following transports:

- [`graphql-helix`](https://github.com/contrawork/graphql-helix) - GraphQL over HTTP
- [`graphql-ws`](https://github.com/enisdenjo/graphql-ws) - GraphQL over WebSocket

Showcasing the following features with Fetcher implementations on GraphiQL:

- Query (HTTP, HTTP-Multipart, WebSocket)
- Mutation (HTTP, HTTP-Multipart, WebSocket)
- Query with @defer (HTTP-Multipart, WebSocket)
- Query with @stream (HTTP-Multipart, WebSocket)
- Subscription (WebSocket/SSE)
- Query with @live (WebSocket/SSE)

Powered by the following libraries:

- [graphql-js](https://github.com/graphql/graphql-js) - The JavaScript reference implementation for GraphQL
- [SSE-Z](https://github.com/contrawork/sse-z) - Simple SSE wrapper
- [meros](https://github.com/maraisr/meros) - Easy multiresponse parser
- [graphql-live-query](https://github.com/n1ru4l/graphql-live-query) - GraphQL live queries for any GraphQL schema

# Setup instructions

1. clone this repo

2. Make sure you have yarn and node v14 installed

3. Run `yarn install`

# Usage

Start the server with `yarn server:start`

Start the frontend `yarn start`

Visit `localhost:3000/__dev__/graphiql`

Execute some operations :)
