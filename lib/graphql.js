const statusFieldsFragment = `
  fragment statusFields on User {
    login
    status {
      indicatesLimitedAvailability
    }
  }
`
module.exports = class GraphQL {
  constructor (context) {
    this.context = context
  }

  async filterAvailableUsers (possibleReviewers) {
    if (possibleReviewers.length === 0) { return [] }
    let query = ''
    for (let i = 0; i < possibleReviewers.length; i++) {
      query += `user_${i}: user(login: "${possibleReviewers[i]}") {
        ...statusFields
      }
      `
    }

    let userStatuses = await this.context.github.query(`
      {
          ${query}
      }
      ${statusFieldsFragment}
    `)

    if (Object.keys(userStatuses).length === 0) {
      return possibleReviewers
    }
    let response = []
    for (let user in userStatuses) {
      if (userStatuses[user].status == null || userStatuses[user].status.indicatesLimitedAvailability === false) {
        response.push(userStatuses[user].login)
      }
    }
    return response
  }
}
