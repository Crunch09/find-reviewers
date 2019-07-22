const { Application } = require('probot')
const Slack = require('../../lib/slack')

describe('Slack', () => {
  let app
  let github

  beforeEach(() => {
    app = new Application()

    // Mock out GitHub client
    app.auth = () => Promise.resolve(github)
  })

  test(
    'gets user mappings from config file',
    async () => {
      let slack = new Slack(null, null, ['florian', 'mathilda'], { 'florian': { 'slack': 'U123' }, 'mathilda': { 'slack': 'U456' } })
      expect(slack.mapSelectedReviewers()).toEqual(['<@U123>', '<@U456>'])
    }
  )
})
