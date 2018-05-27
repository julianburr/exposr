# exposr
Simple node script helping with tagging and publishing semantic releases.

## Why?

Primarily for myself. I a tool that allows me to publish packages easier while being flexible enough to tweak bits and parts in it. Atm it is only flexible in the sense that I can change it and publish a new version of it to reflect my personal needs, ideally this tool becomes more configurable (where needed) to be more generic and usable for anyone 😅

## Install

```bash
yarn add exposr --dev

# or via npm
npm i exposr --dev
```

## Usage

Once added to the project, you can use the `exposr` node binary like this in your package json:

```json
{
  "scripts": {
    "release": "exposr publish",
    "pre-release": "exposr publish --pre"
  }
}
```

Then you can just run `yarn release` (or `npm run release`) and `exposr` will do the rest for you 😊

Or just manually run the command in the root of your project:

```bash
npm i -g exposr
exposr publish
```

### Options

**Versioning**

You can force a specific version or specific version bumps with the following arguments:

* `--version`, `-v`
  * Specific version that should be used for the bump, e.g. `exposr publish --version 1.0.0`
* `--major`
  * Force major bump `a.x.x` → `{a+1}.0.0`
* `--minor`
  - Force minor bump `x.a.x` → `x.{a+1}.0`
* `--patch`
  - Force patch bump `x.x.a` → `x.x.{a+1}`
* `--prerelease`, `--pre`
  * Force pre-release version bump `x.x.x` → `x.x.x-a` (or  `x.x.x-a` → `x.x.x-{a+1}`), incl. publishing with dev tag, not stable tag, in npm

## What does it do?

**1. — Bump package version**

Based on your commits (and additional arguments passed to it) `exposr` will try to smartly determine the next version using [`conventional-recommended-bump`](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-recommended-bump) following the [semver standard](https://semver.org/). It will ask you to confirm the determined version, before bumping it in your projects package json.

**2. — Create changelog**

`exposr` goes through your git commits and uses them to create a changelog. For that, it will create a `changelog.json` file (which is the source of truth for future publications) as well as prepend a version section in the `CHANGELOG.md`.

**3. — Add and commit the changed files**

It will add and commit the changed package json and changelog files to git.

**4. — Create and push version tag**

It will create a version tag for the new version generated and will push all changes including the tag to the current git remote.

**5. — Publish the package to npm**

Finally it will run `npm publish` (or `npm publish --tag=dev` for pre-releases) to publish the new version on npm.

## Todos

- [ ] Add config to opt out of certain steps
- [ ] Add config for file paths
- [ ] Add config for commit message
- [ ] Add dry-run mode
- [ ] Improve changelog
- [ ] Add config for changelog template