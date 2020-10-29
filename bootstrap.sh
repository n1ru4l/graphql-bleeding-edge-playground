#!/bin/sh

yarn
cd graphql-js && yarn && yarn build:npm && cd npmDist && yarn link && cd ../..
cd express-graphql && yarn && yarn build && cd npmDist && yarn link graphql && yarn link && cd ../..
yarn link express-graphql
yarn link graphql
