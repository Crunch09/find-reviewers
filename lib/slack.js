const fetch = require('node-fetch')

module.exports = class Slack {
  constructor (pullRequest, config, pickedReviewers, userMappings) {
    this.pullRequest = pullRequest
    this.config = config
    this.pickedReviewers = pickedReviewers
    this.userMappings = userMappings
  }

  async sendMessage () {
    let modifications = `${this.pullRequest.commits} commits, +${this.pullRequest.additions} -${this.pullRequest.deletions}`
    let pickedReviewers = this.pickedReviewers.map(username => `<https://github.com/${username}|${username}>`).join(', ')
    let userNotifications = this.mapSelectedReviewers().join(', ')
    if (userNotifications !== '') {
      userNotifications = `for ${userNotifications}`
    }
    return fetch(this.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        'channel': this.config.channel,
        'username': 'find-reviewers',
        'text': `Review requested: <${this.pullRequest.html_url}|${this.pullRequest.base.repo.full_name}#${this.pullRequest.number} by ${this.pullRequest.user.login}> ${userNotifications}`.trim(),
        'attachments': [
          {
            'pretext': this.pullRequest.title,
            'fallback': `${pickedReviewers}. ${modifications}`,
            'color': 'good',
            'fields': [
              {
                'title': 'Requested reviewers',
                'value': pickedReviewers,
                'short': true
              },
              {
                'title': 'Changes',
                'value': modifications,
                'short': true
              }
            ]
          }
        ]
      })
    })
      .then(response => response)
  }

  mapSelectedReviewers () {
    let mappedUsers = []
    if (this.userMappings) {
      mappedUsers = this.pickedReviewers.map((username) => {
        var userMapping = this.userMappings[username]
        if (!!userMapping && userMapping.hasOwnProperty('slack')) {
          return `<@${userMapping.slack}>`
        }
      }).filter(x => x)
    }
    return mappedUsers
  }
}
