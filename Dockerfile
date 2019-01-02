FROM node:10

ENV PATH=$PATH:/github/workspace/node_modules/.bin
ENV LOG_LEVEL=debug

COPY . .
RUN npm install --production

RUN node_modules/.bin/probot receive -p ../../github/workflow/event.json /github/workspace/index.js
