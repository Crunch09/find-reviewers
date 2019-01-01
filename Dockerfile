FROM node:10

ENV PATH=$PATH:$WORKDIR/node_modules/.bin

COPY . .
RUN npm install --production

ENTRYPOINT ["probot", "receive", "-p", "../../github/workflow/event.json"]
CMD ["index.js"]
