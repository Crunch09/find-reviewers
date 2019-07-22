const Slack = require('./lib/slack')
const GraphQL = require('./lib/graphql')

module.exports = app => {
  app.on(`pull_request.labeled`, async context => {
    const label = context.payload.label.name

    const config = await context.config('reviewers.yml')
    for (let i in config.labels) {
      if (label === config.labels[i].label) {
        await assignReviewers(context, config.labels[i], config.notifications, config.user_mappings)
      }
    }
  })

  app.on(`issue_comment.created`, async context => {
    let commentRegex = /^\/reviewers unassign @(\S+)/gi
    const body = context.payload.comment.body
    let unassignment = commentRegex.exec(body)

    if (unassignment !== null) {
      let unassignedPerson = unassignment[1].toLowerCase()
      let currentReviewers = await getCurrentReviewers(context)
      let mappedCurrentReviewers = currentReviewers.data.users.map(x => x.login.toLowerCase()).filter(x => x)

      if (mappedCurrentReviewers.includes(unassignedPerson)) {
        let replacementReviewer = await getPossibleReviewer(context, [unassignedPerson.toLowerCase(), ...mappedCurrentReviewers].filter(x => x), unassignedPerson.toLowerCase())
        if (replacementReviewer) {
          await context.github.pullRequests.deleteReviewRequest(
            context.issue({ reviewers: [unassignment[1]] })
          )
          await context.github.pullRequests.createReviewRequest(
            context.issue(
              {
                reviewers: [replacementReviewer.toLowerCase(), ...mappedCurrentReviewers.filter(name => name !== unassignedPerson)],
                team_reviewers: currentReviewers.data.teams.map(x => x.slug).filter(y => y)
              }
            )
          )
        }
      }
    }
  })

  async function getCurrentReviewers (context) {
    return context.github.pullRequests.listReviewRequests(context.issue())
  }

  async function getPossibleReviewer (context, reviewersToExclude, unassignedPerson) {
    const currentLabels = context.payload.issue.labels.map(x => x.name)

    const uniqueReviewersToExclude = [...(new Set(reviewersToExclude))]

    const owner = context.payload.issue.user.login.toLowerCase()
    reviewersToExclude = [owner, ...uniqueReviewersToExclude].filter(x => x)

    const config = await context.config('reviewers.yml')
    for (let i in config.labels) {
      if (currentLabels.includes(config.labels[i].label)) {
        for (let g in config.labels[i].groups) {
          let specificConfig = config.labels[i].groups[g]
          let possibleReviewers = specificConfig.possible_reviewers.map(x => x.toLowerCase())
          if (possibleReviewers && possibleReviewers.includes(unassignedPerson) && specificConfig.number_of_picks) {
            for (let i = 0; i < reviewersToExclude.length; i++) {
              let index = possibleReviewers.indexOf(reviewersToExclude[i])
              if (index > -1) {
                possibleReviewers.splice(index, 1)
              }
            }
            let graphQl = new GraphQL(context)
            possibleReviewers = await graphQl.filterAvailableUsers(possibleReviewers)
            if (possibleReviewers.length > 0) {
              return possibleReviewers[Math.floor(Math.random() * possibleReviewers.length)]
            }
          }
        }
      }
    }
    return null
  }

  async function assignReviewers (context, config, notificationsConfig, userMappings) {
    const owner = context.payload.pull_request.user.login.toLowerCase()
    const existingReviewers = await getCurrentReviewers(context)
    let pickedReviewers = []

    for (let i in config.groups) {
      let group = config.groups[i]
      if (group.possible_reviewers && group.number_of_picks) {
        let possibleReviewers = group.possible_reviewers.map(x => x.toLowerCase())
        let numberOfPicks = group.number_of_picks

        // Remove PR owner from the array of possible reviewers
        let index = possibleReviewers.indexOf(owner)
        if (index > -1) {
          possibleReviewers.splice(index, 1)
        }

        // Remove existing reviewers from the array of possible reviewers
        for (let i = 0; i < existingReviewers.data.users.length; i++) {
          index = possibleReviewers.indexOf(existingReviewers.data.users[i].login.toLowerCase())
          if (index > -1) {
            possibleReviewers.splice(index, 1)
          }
        }

        // Remove reviewers already picked from the array of possible reviewers
        for (let i = 0; i < pickedReviewers.length; i++) {
          index = possibleReviewers.indexOf(pickedReviewers[i])
          if (index > -1) {
            possibleReviewers.splice(index, 1)
          }
        }

        // Remove reviewers who are busy according to their user status
        let graphQl = new GraphQL(context)
        possibleReviewers = await graphQl.filterAvailableUsers(possibleReviewers)

        // Pick reviewers at random until you have enough, or run out of possible reviewers
        for (let i = 0; i < numberOfPicks && possibleReviewers.length > 0; i++) {
          let pickedReviewer = possibleReviewers[Math.floor(Math.random() * possibleReviewers.length)]
          index = possibleReviewers.indexOf(pickedReviewer)
          possibleReviewers.splice(index, 1)

          pickedReviewers.push(pickedReviewer)
        }
      }
    }
    if (pickedReviewers.length > 0) {
      try {
        await context.github.pullRequests.createReviewRequest(
          context.issue(
            {
              reviewers: [...pickedReviewers, ...existingReviewers.data.users.map(x => x.login.toLowerCase())].filter(x => x),
              team_reviewers: existingReviewers.data.teams.map(x => x.slug).filter(y => y)
            }
          )
        )
        if (!!notificationsConfig && notificationsConfig.hasOwnProperty('slack')) {
          let slack = new Slack(context.payload.pull_request, notificationsConfig.slack, pickedReviewers, userMappings)
          await slack.sendMessage()
        }
      } catch (error) {
        context.log.error({ error: error.message })
      }
    }
  }
}
