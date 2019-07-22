# find-reviewers [![Build Status](https://travis-ci.com/Crunch09/find-reviewers.svg?branch=master)](https://travis-ci.com/Crunch09/find-reviewers)

> A GitHub App built with [Probot](https://github.com/probot/probot) that randomly assigns reviewers out of a given list of
possible reviewers when a specified label
is added to a pull-request.

## Installation from the GitHub App Store

Go to https://github.com/apps/find-reviewers and follow the instructions.

## Configuration

Create a file `~/.github/reviewers.yml` in your repository to set up the configuration.

```yaml
---
# Describe the labels that once added to a pull request cause the app to assign
# randomly chosen reviewers.
labels:
  -
    # Define the groups of reviewers from which the reviewers will be chosen. In this
    # example, when the label `ready-for-review` is applied, two reviewers are
    # chosen from the first group and one reviewer from the second group.
    groups:
      -
        number_of_picks: 2
        possible_reviewers:
          - florian
          - erika
          - octobot
          - mathilda
          - james
          - cx-3po
      -
        number_of_picks: 1
        possible_reviewers:
          - romain
          - maria
          - amal
          - ana
    label: "ready-for-review"
  -
    groups:
      -
        number_of_picks: 1
        possible_reviewers:
          - foo
          - bar
          - baz
    label: "Ready for review - small"
# Optional: Define which Slack channel to notify once random reviewers have been
# chosen and their review was requested.
# The `URL` is of an [Incoming Webhook](https://api.slack.com/incoming-webhooks).
notifications:
  slack:
    url: "https://hooks.slack.com/services/AAA/BBB/CCC"
    channel: "#pull_requests"

# Optional: Define mappings between GitHub usernames and Slack usernames so people
# get a notification when their review is being requested.
# The slack user-id can be found in each user's profile settings.
user_mappings:
  florian:
    slack: U123456
  octobot:
    slack: U987654
```


## Contributing

### Local setup
```sh
# Install dependencies
npm install

# Run the bot
npm start
```

If you have suggestions for how find-reviewers could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2018 Florian Thomas <flo@florianthomas.net> (https://github.com/Crunch09/find-reviewers)
