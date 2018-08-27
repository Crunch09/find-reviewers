module.exports = app => {
  // Your code here
  app.log('Yay, the app was loaded!')

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
  app.on(`pull_request.labeled`, async context => {
    const label = context.payload.label.name

    context.log({event: context.event, label: label})

    const config = await context.config('reviewers.yml', {label: 'ready-for-review'})

    if (label === config.label) {
      await assignReviewers(context, config)
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

      context.log({currentReviewers: mappedCurrentReviewers, unassignedPerson: unassignedPerson})
      if (mappedCurrentReviewers.includes(unassignedPerson)) {

        let replacementReviewer = await getPossibleReviewer(context, [unassignedPerson.toLowerCase(), ...mappedCurrentReviewers].filter(x => x))
        if (replacementReviewer) {
          await context.github.pullRequests.deleteReviewRequest(
            context.issue({ reviewers: [unassignment[1]] })
          )
          await context.github.pullRequests.createReviewRequest(
            context.issue(
              {
                reviewers: [replacementReviewer.toLowerCase(), ...mappedCurrentReviewers.filter(name => name != unassignedPerson)],
                team_reviewers: currentReviewers.data.teams.map(x => x.slug).filter(y => y)
              }
            )
          )
        }
      }
    }
  })

  async function getCurrentReviewers (context) {
    return await context.github.pullRequests.getReviewRequests(context.issue())
  }

  async function getPossibleReviewer (context, reviewersToExclude) {
    const uniqueReviewersToExclude = [...(new Set(reviewersToExclude))];

    const owner = context.payload.issue.user.login.toLowerCase()
    reviewersToExclude = [owner, ...uniqueReviewersToExclude].filter(x => x)

    const config = await context.config('reviewers.yml', {label: 'ready-for-review'})
    if (config.possible_reviewers && config.number_of_picks) {
      let possibleReviewers = config.possible_reviewers.map(x => x.toLowerCase())

      for (let i = 0; i < reviewersToExclude.length; i++) {
        let index = possibleReviewers.indexOf(reviewersToExclude[i])
        if (index > -1) {
          possibleReviewers.splice(index, 1)
        }
      }
      return possibleReviewers[Math.floor(Math.random() * possibleReviewers.length)]
    }
    return null
  }

  async function assignReviewers (context, config) {
    const owner = context.payload.pull_request.user.login.toLowerCase()
    context.log({ owner: owner })

    if (config.possible_reviewers && config.number_of_picks) {
      let possibleReviewers = config.possible_reviewers.map(x => x.toLowerCase())
      let numberOfPicks = config.number_of_picks

      let index = possibleReviewers.indexOf(owner)
      if (index > -1) {
        possibleReviewers.splice(index, 1)
      }

      const existingReviewers = await getCurrentReviewers(context)

      for (let i = 0; i < existingReviewers.data.users.length; i++) {
        index = possibleReviewers.indexOf(existingReviewers.data.users[i].login.toLowerCase())
        if (index > -1) {
          possibleReviewers.splice(index, 1)
        }
      }

      let pickedReviewers = []
      for (let i = 0; i < numberOfPicks; i++) {
        let pickedReviewer = possibleReviewers[Math.floor(Math.random() * possibleReviewers.length)]
        index = possibleReviewers.indexOf(pickedReviewer)
        possibleReviewers.splice(index, 1)

        pickedReviewers.push(pickedReviewer)
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
        } catch (error) {
          context.log({ error: error })
        }
      }
    }
  }
}
