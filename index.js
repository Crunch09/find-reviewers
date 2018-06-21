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
    if(label == "ready-for-review"){
      await assignReviewers(context)
    }
  })

  async function assignReviewers(context) {
    const owner = context.payload.pull_request.user.login
    context.log({ owner: owner })

    let possibleReviewers = ["annebyrne", "Crunch09", "erikamorenosierra", "nikz", "qermyt", "RomainPiel"]
    let index = possibleReviewers.indexOf(owner)
    if (index > -1) {
      possibleReviewers.splice(index, 1)
    }
    let firstReviewer = possibleReviewers[Math.floor(Math.random()*possibleReviewers.length)]
    index = possibleReviewers.indexOf(firstReviewer)
    possibleReviewers.splice(index, 1)

    let secondReviewer = possibleReviewers[Math.floor(Math.random()*possibleReviewers.length)]

    try {
      await context.github.pullRequests.createReviewRequest(context.issue({reviewers: [firstReviewer, secondReviewer]}))
    } catch(error) {
      context.log({ error: error })
    }
  }
}
