<div align="center">
	<h1 align="center">Experimental GraphQL Playground</h1>
	<p align="center">Demonstration of the <i>bleeding edge</i> GraphQL features</p>
</div>

---

### Features:

- Query (HTTP, HTTP-Multipart, WebSocket)
- Mutation (HTTP, HTTP-Multipart, WebSocket)
- Query with @defer (HTTP-Multipart, WebSocket)
- Query with @stream (HTTP-Multipart, WebSocket)
- Subscription (WebSocket/SSE)
- Query with @live (WebSocket/SSE)

> Check out the [Fetcher implementations on GraphiQL](src/dev/GraphiQL.tsx)

Built on the following transports:

- [`graphql-helix`](https://github.com/contrawork/graphql-helix) - GraphQL over HTTP
- [`graphql-ws`](https://github.com/enisdenjo/graphql-ws) - GraphQL over WebSocket
- [`@n1ru4l/socket-io-graphql-server`](https://github.com/n1ru4l/graphql-live-query/tree/main/packages/socket-io-graphql-server) - GraphQL over Socket.io

and powered by the following libraries:

- [graphql-js](https://github.com/graphql/graphql-js) - The JavaScript reference implementation for GraphQL
- [meros](https://github.com/maraisr/meros) - Makes reading multipart responses simple
- [SSE-Z](https://github.com/contrawork/sse-z) - Simple SSE wrapper
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
