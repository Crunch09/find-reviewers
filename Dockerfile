FROM node:10

ENV PATH=$PATH:/github/workspace/node_modules/.bin

COPY . .
RUN npm install --production

ENTRYPOINT ["probot", "receive", "-p", "../../github/workflow/event.json"]
CMD ["/github/workspace/index.js"]
