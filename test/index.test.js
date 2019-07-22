const nock = require('nock')
const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')
const btoa = require('btoa')

const { Probot } = require('probot')
const findReviewers = require('..')

// Require fixtures
const pullRequestLabeled = require('./fixtures/pull_request.labeled')
const issueCommentCreated = require('./fixtures/issue_comment.created')
const userStatusResponseGroupOne = require('./fixtures/user_status_response_group_one')
const userStatusResponseGroupTwo = require('./fixtures/user_status_response_group_two')

jest.setTimeout(10000)
nock.disableNetConnect()

describe('Find reviewers', () => {
  let probot, app, config, hexConfig, postSlackMessage, addReviewersBody,
    deleteReviewersBody, graphQlResponse, listReviewersResponse, configResponse

  beforeEach(() => {
    nock.cleanAll()
    config = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, 'fixtures/config.yml'), 'utf8'))
    hexConfig = btoa(JSON.stringify(config))

    listReviewersResponse = (uri, requestBody) => {
      return {
        users: [],
        teams: []
      }
    }
    configResponse = (uri, requestBody) => {
      return {
        content: hexConfig,
        encoding: 'base64',
        type: 'file'
      }
    }
    graphQlResponse = (uri, requestBody) => {
      return { data: { } }
    }
    addReviewersBody = (body) => { return true }
    deleteReviewersBody = (body) => { return true }

    postSlackMessage = nock('https://hooks.slack.com/services/AAA/BBB/CCC')
      .post('', {
        'channel': '#pull_requests',
        'username': 'find-reviewers',
        'text': /Review requested: <https:\/\/github.com\/Crunch09\/octo-test\/pull\/2\|Crunch09\/octo-test#2 by Crunch09>.*/,
        'attachments': [
          {
            'pretext': 'some readme updates',
            'fallback': /.+1 commits, \+2 -0/,
            'color': 'good',
            'fields': [
              {
                'title': 'Requested reviewers',
                'value': /.+/,
                'short': true
              },
              {
                'title': 'Changes',
                'value': '1 commits, +2 -0',
                'short': true
              }
            ]
          }
        ] })
      .reply(200, 'ok')

    nock('https://api.github.com')
      .post('/app/installations/227031/access_tokens').reply(200, { token: 'test' })
      .get('/repos/Crunch09/octo-test/contents/.github/reviewers.yml').reply(200, (url, requestBody) => configResponse(url, requestBody))
      .get('/repos/Crunch09/octo-test/pulls/2/requested_reviewers').reply(200, (url, requestBody) => listReviewersResponse(url, requestBody))
      .post('/repos/Crunch09/octo-test/pulls/2/requested_reviewers', body => addReviewersBody(body)).reply(200, {})
      .delete('/repos/Crunch09/octo-test/pulls/2/requested_reviewers', body => deleteReviewersBody(body)).reply(200, {})
      .post('/graphql').times(3).reply(200, (url, requestBody) => graphQlResponse(url, requestBody))

    probot = new Probot({})
    app = probot.load(findReviewers)
    app.app = () => 'test'
  })

  describe('PR labeled', () => {
    describe('Config with all available options', () => {
      test('Complete config', async () => {
        addReviewersBody = (body) => {
          expect(body.reviewers.length).toBe(3)
          let intersection = config.labels[0].groups[0].possible_reviewers.filter(x => body.reviewers.includes(x))
          expect(intersection.length).toBe(2)
          intersection = config.labels[0].groups[1].possible_reviewers.filter(x => body.reviewers.includes(x))
          expect(intersection.length).toBe(1)
          return true
        }
        await probot.receive({ name: `pull_request`, payload: pullRequestLabeled })

        expect(postSlackMessage.isDone()).toBeTruthy()
      })

      describe('with people being busy', () => {
        beforeEach(() => {
          graphQlResponse = (url, requestBody) => {
            if (requestBody.query.match(/florian/)) {
              // first reviewers group
              return userStatusResponseGroupOne
            }
            // second reviewers group
            return userStatusResponseGroupTwo
          }
        })

        test('excludes those people', async () => {
          addReviewersBody = (body) => {
            let intersection = ['cx-3po', 'octobot', 'ana'].filter(x => body.reviewers.includes(x))
            expect(body.reviewers.length).toBe(3)
            expect(intersection.length).toBe(3)
            if (body.reviewers['florian'] || body.reviewers['mathilda'] || body.reviewers['amal'] || body.reviewers['erika']) {
              return false
            }
            return true
          }

          await probot.receive({ name: `pull_request`, payload: pullRequestLabeled })
        })
      })
    })

    describe('Config without notifications', () => {
      beforeEach(() => {
        delete config.notifications.slack
        hexConfig = btoa(JSON.stringify(config))

        configResponse = () => {
          return {
            content: hexConfig,
            encoding: 'base64',
            type: 'file'
          }
        }
      })

      test('does not try to post to slack', async () => {
        await probot.receive({ name: `pull_request`, payload: pullRequestLabeled })

        expect(postSlackMessage.isDone()).toBeFalsy()
      })
    })

    describe('Only one reviewer in both groups', async () => {
      beforeEach(() => {
        for (let i = 0; i < config.labels[0].groups.length; i++) {
          config.labels[0].groups[i].possible_reviewers = ['florian']
        }
        hexConfig = btoa(JSON.stringify(config))

        configResponse = () => {
          return {
            content: hexConfig,
            encoding: 'base64',
            type: 'file'
          }
        }
      })
      test('does not pick the same reviewer twice', async () => {
        addReviewersBody = (body) => {
          expect(body.reviewers.length).toBe(1)
          expect(body.reviewers[0]).toBe('florian')
          return true
        }
        await probot.receive({ name: `pull_request`, payload: pullRequestLabeled })
      })
    })
  })

  describe('Reviewer unassigned', () => {
    beforeEach(() => {
      listReviewersResponse = (uri, requestBody) => {
        return {
          users: [{ login: 'cx-3po' }],
          teams: []
        }
      }
    })
    test('finds a replacement', async () => {
      addReviewersBody = (body) => {
        expect(config.labels[0].groups[0].possible_reviewers).toEqual(expect.arrayContaining(body.reviewers))
        expect(body.reviewers).toEqual(expect.not.arrayContaining(['cx-3po']))
        expect(body.reviewers.length).toEqual(1)
        return true
      }

      deleteReviewersBody = (body) => {
        expect(body.reviewers.length).toBe(1)
        expect(body.reviewers[0]).toBe('CX-3PO')
        return true
      }
      await probot.receive({ name: `issue_comment`, payload: issueCommentCreated })
    })

    describe('with people being busy', () => {
      beforeEach(() => {
        graphQlResponse = (url, requestBody) => {
          return {
            data: {
              user_0: {
                login: 'octobot',
                status: null
              }
            }
          }
        }
      })

      test('excludes those people', async () => {
        addReviewersBody = (body) => {
          expect(body.reviewers.length).toBe(1)
          expect(body.reviewers[0]).toBe('octobot')
          return true
        }
        await probot.receive({ name: `issue_comment`, payload: issueCommentCreated })
      })
    })
  })
})
