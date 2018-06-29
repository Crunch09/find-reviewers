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

  async function assignReviewers (context, config) {
    const owner = context.payload.pull_request.user.login
    context.log({ owner: owner })

    if (config.possible_reviewers && config.number_of_picks) {
      let possibleReviewers = config.possible_reviewers
      let numberOfPicks = config.number_of_picks

      let index = possibleReviewers.indexOf(owner)
      if (index > -1) {
        possibleReviewers.splice(index, 1)
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
          await context.github.pullRequests.createReviewRequest(context.issue({reviewers: pickedReviewers}))
        } catch (error) {
          context.log({ error: error })
        }
      }
    }
  }
}
