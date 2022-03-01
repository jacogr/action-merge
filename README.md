## action-merge

Merge GitHub actions based on checks and labels.

Example config -

```
name: Auto-merge pull request

on: pull_request

jobs:
  auto-approve:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: jacogr/action-approve@master
        with:
          checks: lint,build,test
          labels: automerge
          token: ${{ secrets.GITHUB_TOKEN }}
```
