const nock = require('nock')
const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')
const btoa = require('btoa')

// You can import your modules
const { Probot } = require('probot')
const findReviewers = require('..')

// Require fixtures
const config = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, 'fixtures/config.yml'), 'utf8'))
const pullRequestLabeled = require('./fixtures/pull_request.labeled')
const issueCommentCreated = require('./fixtures/issue_comment.created')

nock.disableNetConnect()

describe('Find reviewers', () => {
  let probot, github, app

  beforeEach(() => {
    probot = new Probot({})

    app = probot.load(findReviewers)

    github = {
      repos: {
        // Response for getting content from '.github/ISSUE_REPLY_TEMPLATE.md'
        getContents: jest.fn().mockImplementation(() => Promise.resolve({
          data: {
            content: btoa(JSON.stringify(config))// Buffer.from(`Hello World!`).toString('base64')
          }
        }))
      },
      pullRequests: {
        getReviewRequests: jest.fn().mockImplementation(() => Promise.resolve({
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

  test('PR labeled', async () => {
    github.pullRequests.createReviewRequest = jest.fn().mockImplementation(({ owner, repo, number, reviewers, teamReviewers }) => Promise.resolve())
    await probot.receive({ name: `pull_request`, payload: pullRequestLabeled })

    expect(github.pullRequests.createReviewRequest.mock.calls.length).toBe(1)
    expect(github.pullRequests.createReviewRequest.mock.calls[0][0].reviewers.length).toBe(3)
    let intersection = config.labels[0].groups[0].possible_reviewers.filter(x => github.pullRequests.createReviewRequest.mock.calls[0][0].reviewers.includes(x))
    expect(intersection.length).toBe(2)
    intersection = config.labels[0].groups[1].possible_reviewers.filter(x => github.pullRequests.createReviewRequest.mock.calls[0][0].reviewers.includes(x))
    expect(intersection.length).toBe(1)
  })

  test('Reviewer unsassigned', async () => {
    github.pullRequests.getReviewRequests = jest.fn().mockImplementation(() => Promise.resolve({
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
    expect(github.pullRequests.getReviewRequests.mock.calls.length).toBe(1)
    expect(github.pullRequests.deleteReviewRequest.mock.calls.length).toBe(1)
    expect(github.pullRequests.deleteReviewRequest.mock.calls[0][0].reviewers).toEqual(['CX-3PO'])
  })
})
