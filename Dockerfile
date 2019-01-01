FROM node:10

ENV PATH=$PATH:$WORKDIR/node_modules/.bin

COPY . .
RUN npm install --production

ENTRYPOINT ["probot", "receive"]
CMD ["/app/index.js"]
