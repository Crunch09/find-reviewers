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

nock.disableNetConnect()

describe('Find reviewers', () => {
  let probot, github, app, config, hexConfig, postSlackMessage

  beforeEach(() => {
    postSlackMessage = nock('https://hooks.slack.com/services/AAA/BBB/CCC')
      .post('', {
        'channel': '#pull_requests',
        'username': 'find-reviewers',
        'text': `Review requested: <https://github.com/Crunch09/octo-test/pull/2|Crunch09/octo-test#2 by Crunch09>`,
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

    probot = new Probot({})

    config = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, 'fixtures/config.yml'), 'utf8'))
    hexConfig = btoa(JSON.stringify(config))
    app = probot.load(findReviewers)

    github = {
      repos: {
        getContents: jest.fn().mockImplementation(() => Promise.resolve({
          data: {
            content: hexConfig
          }
        }))
      },
      pullRequests: {
        listReviewRequests: jest.fn().mockImplementation(() => Promise.resolve({
          data: {
            users: [],
            teams: []
          }
        })),
        createReviewRequest: jest.fn().mockImplementation(() => Promise.resolve({
          code: 404,
          status: 'Not Found',
          headers: {}
        }))
      }
    }

    app.auth = () => Promise.resolve(github)

    app.app = () => 'test'
  })

  describe('PR labeled', async () => {
    beforeEach(() => {
      github.pullRequests.createReviewRequest = jest.fn().mockImplementation(({ owner, repo, number, reviewers, teamReviewers }) => Promise.resolve())
      hexConfig = btoa(JSON.stringify(config))
    })
    test('Complete config', async () => {
      await probot.receive({ name: `pull_request`, payload: pullRequestLabeled })

      expect(github.pullRequests.createReviewRequest.mock.calls.length).toBe(1)
      expect(github.pullRequests.createReviewRequest.mock.calls[0][0].reviewers.length).toBe(3)
      let intersection = config.labels[0].groups[0].possible_reviewers.filter(x => github.pullRequests.createReviewRequest.mock.calls[0][0].reviewers.includes(x))
      expect(intersection.length).toBe(2)
      intersection = config.labels[0].groups[1].possible_reviewers.filter(x => github.pullRequests.createReviewRequest.mock.calls[0][0].reviewers.includes(x))
      expect(intersection.length).toBe(1)
      expect(postSlackMessage.isDone()).toBeTruthy()
    })

    describe('Config without notifications', async () => {
      beforeEach(() => {
        delete config.notifications.slack
        hexConfig = btoa(JSON.stringify(config))
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
      })
      test('does not pick the same reviewer twice', async () => {
        await probot.receive({ name: `pull_request`, payload: pullRequestLabeled })

        expect(github.pullRequests.createReviewRequest.mock.calls.length).toBe(1)
        expect(github.pullRequests.createReviewRequest.mock.calls[0][0].reviewers.length).toBe(1)
        expect(github.pullRequests.createReviewRequest.mock.calls[0][0].reviewers[0]).toBe('florian')
      })
    })
  })

  test('Reviewer unassigned', async () => {
    github.pullRequests.listReviewRequests = jest.fn().mockImplementation(() => Promise.resolve({
      data: {
        users: [{ login: 'cx-3po' }],
        teams: []
      }
    }))
    github.pullRequests.deleteReviewRequest = jest.fn().mockImplementation(({ owner, repo, number, reviewers, teamReviewers }) => Promise.resolve())

    github.pullRequests.createReviewRequest = ({ owner, repo, number, reviewers, teamReviewers }) => {
      expect(config.labels[0].groups[0].possible_reviewers).toEqual(expect.arrayContaining(reviewers))
      expect(reviewers).toEqual(expect.not.arrayContaining(['cx-3po']))
      expect(reviewers.length).toEqual(1)
    }

    await probot.receive({ name: `issue_comment`, payload: issueCommentCreated })
    expect(github.pullRequests.listReviewRequests.mock.calls.length).toBe(1)
    expect(github.pullRequests.deleteReviewRequest.mock.calls.length).toBe(1)
    expect(github.pullRequests.deleteReviewRequest.mock.calls[0][0].reviewers).toEqual(['CX-3PO'])
  })
})
