#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const semver = require('semver');
const chalk = require('chalk');
const conventionalRecommendedBump = require('conventional-recommended-bump');
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const gitlog = require('gitlog');
const Confirm = require('prompt-confirm');

const args = process.argv.slice(2);
const scriptIndex = args.findIndex((x) => x === 'publish');
const script = scriptIndex === -1 ? args[0] : args[scriptIndex];

// Escaping e.g. for binary paths
function escape (string) {
  return string.replace(/ /g, '\\ ').replace(/\n/g, '');
}

// Resolve paths relative to cwd
function resolve (filePath) {
  return path.resolve(process.cwd(), filePath);
}

// Get args
const ARGS = scriptIndex > 0 ? args.slice(0, scriptIndex) : args;

// Get all binary paths necessary for defined steps
const GIT_BIN = escape(execSync('which git').toString());
const NPM_BIN = escape(execSync('which npm').toString());

// GET all necessary file paths
const PKG_JSON_PATH = resolve('./package.json');

const CL_JSON_PATH = resolve('./changelog.json');
const CL_MD_PATH = resolve('./CHANGELOG.md');
const README_MD_PATH = resolve('./README.md');

const COMMIT_TYPES_JSON = path.resolve(
  __dirname,
  '../node_modules/conventional-commit-types/index.json'
);

function getCommitTypes () {
  let types = {};
  if (fs.existsSync(COMMIT_TYPES_JSON)) {
    types = fs.readJsonSync(COMMIT_TYPES_JSON).types;
  }
  return types;
}

function getPackageJson () {
  let pkgJson = {};
  if (fs.existsSync(PKG_JSON_PATH)) {
    pkgJson = fs.readJsonSync(PKG_JSON_PATH);
  }
  return pkgJson;
}

function getChangelogJson () {
  let clJson = {};
  if (fs.existsSync(CL_JSON_PATH)) {
    clJson = fs.readJsonSync(CL_JSON_PATH);
  }
  return clJson;
}

function getLatestChangelogCommit (version, clJson) {
  if (!clJson || !Object.keys(clJson).length) {
    return null;
  }
  let lastHash = null;
  const commits = clJson[version].commits;
  if (!commits) {
    return null;
  }
  const lastCommit = commits[0];
  return lastCommit ? lastCommit || null : null;
}

function getCommits (number = 100) {
  return new Promise((resolve, reject) => {
    gitlog({ repo: __dirname, number }, function (err, result) {
      if (err) {
        reject(new Error(err));
      } else {
        // Filter out release commits!
        let commits = result.filter(
          (c) => !c.subject.startsWith('chore(release): ')
        );
        // ...and add type by using prefix
        // TODO: use package to parse commit subject to commit type, for now hard coded
        const types = getCommitTypes();
        const typeKeys = Object.keys(types);
        commits = commits.map((commit) => {
          let type = null;
          const withoutScope = commit.subject.match(
            `^(${typeKeys.join('|')}): (.*)`,
            'gi'
          );
          const withScope = commit.subject.match(
            `^(${typeKeys.join('|')})\\([^\\)]\\): (.*)`,
            'gi'
          );
          const key = commit.subject.match(`^(${typeKeys.join('|')})`);
          if (withoutScope) {
            commit.subject = withoutScope[2];
            type = withoutScope[1];
          } else if (withScope) {
            commit.subject = withScope[2];
            type = withScope[1];
          }
          return Object.assign({}, commit, {
            type: type ? Object.assign({}, types[type], { key: type }) : null
          });
        });
        resolve(commits);
      }
    });
  });
}

function getRecomendedVersion (currVersion) {
  return new Promise((resolve, reject) => {
    let fromArgs = null;
    if (ARGS.find((a) => a === '--major')) {
      fromArgs = 'major';
    } else if (ARGS.find((a) => a === '--minor')) {
      fromArgs = 'minor';
    } else if (ARGS.find((a) => a === '--patch')) {
      fromArgs = 'patch';
    } else if (ARGS.find((a) => a === '--prerelease' || a === '--pre')) {
      fromArgs = 'prerelease';
    }

    if (fromArgs) {
      console.log(
        chalk.grey(`   Arg --${fromArgs} will force ${fromArgs} version bump`)
      );
      const forceBump = semver.inc(currVersion, fromArgs);
      resolve(forceBump);
      return;
    }

    const vIndex = ARGS.findIndex((a) => a === '--version' || a === '-v');
    if (vIndex > -1) {
      const forceVersion = ARGS[vIndex + 1];
      if (forceVersion) {
        console.log(
          chalk.grey(
            `   Arg --version ${forceVersion} will force version ${forceVersion}`
          )
        );
        resolve(forceVersion);
        return;
      }
    }

    conventionalRecommendedBump({ preset: 'angular' }, function (err, result) {
      if (err) {
        reject(new Error(err));
      } else {
        const { releaseType } = result;
        const recVersion = semver.inc(currVersion, releaseType);
        resolve(recVersion);
      }
    });
  });
}

function updatePackageJson (nextVersion, currPkgJson) {
  const newPkgJson = Object.assign({}, currPkgJson, { version: nextVersion });
  fs.writeFileSync(PKG_JSON_PATH, JSON.stringify(newPkgJson, null, 2));
  return newPkgJson;
}

function updateChangelogJson (nextVersion, newCommits, currClJson) {
  const newClJson = Object.assign({}, currClJson, {
    [nextVersion]: {
      commits: newCommits,
      ts: new Date().getTime()
    }
  });
  fs.writeFileSync(CL_JSON_PATH, JSON.stringify(newClJson, null, 2));
  return newClJson;
}

function fmtDate (ts) {
  const date = new Date(ts);
  return (
    `${date.getFullYear()}-` +
    `${('00' + (date.getMonth() + 1)).substr(-2)}-` +
    `${('00' + date.getDate()).substr(-2)}`
  );
}

function createChangelogMarkdown (clJson) {
  const pkgJson = getPackageJson();
  let md = '# Changelog';
  Object.keys(clJson).reverse().forEach((version) => {
    md += `\n\n## v${version} (${fmtDate(clJson[version].ts)})\n`;
    clJson[version].commits.forEach((commit) => {
      md +=
        `\n * [${commit.abbrevHash}]` +
        `(${pkgJson.homepage}/commit/${commit.hash})` +
        ` - ${commit.subject}`;
    });
  });
  fs.writeFileSync(CL_MD_PATH, md);
}

async function run () {
  console.log();
  console.log(chalk.bold('Publish new version:'));
  console.log();

  // Get package.json & get changelog.json
  const pkgJson = getPackageJson();
  const clJson = getChangelogJson();

  // Get commits
  const commits = await getCommits();

  // + filter depending on last commit in change log
  const lastCommit = getLatestChangelogCommit(pkgJson.version, clJson);
  let newCommits = commits;
  if (lastCommit && lastCommit.hash) {
    newCommits = newCommits.slice(
      0,
      newCommits.findIndex((c) => c.hash === lastCommit.hash)
    );
  }

  if (!newCommits.length) {
    console.log(
      chalk.yellow.bold(
        ' ✖︎ No new commits found! No need for a new version I reckon!'
      )
    );
    console.log();
    return;
  }

  console.log(
    chalk.grey(
      `   ${newCommits.length} new commit${newCommits.length !== 1
        ? 's'
        : ''} found`
    )
  );

  // Get recommended version
  const recVersion = await getRecomendedVersion(pkgJson.version);
  console.log(
    chalk.grey(
      `   Recommended version: ${pkgJson.version} → ${chalk.bold.green(
        recVersion
      )}`
    )
  );

  const prompt = new Confirm('Do you want to continue?');
  console.log();

  const doContinue = await prompt.run();
  console.log();

  if (!doContinue) {
    return;
  }

  // Update package.json
  updatePackageJson(recVersion, pkgJson);
  console.log(
    chalk.grey(
      ` ${chalk.green.bold('✔')}︎ Updated package.json to version ${recVersion}`
    )
  );

  // Update changelog.json
  const newClJson = updateChangelogJson(recVersion, newCommits, clJson);
  console.log(
    chalk.grey(
      ` ${chalk.green.bold(
        '✔'
      )} Added new version and commits to changelog.json`
    )
  );

  // Update CHANGELOG.md
  createChangelogMarkdown(newClJson);
  console.log(chalk.grey(` ${chalk.green.bold('✔')} Updated CHANGELOG.md`));

  // git add changelog.json package.json CHANGELOG.md appcast.xml
  execSync(`${GIT_BIN} add package.json changelog.json CHANGELOG.md`);
  console.log(chalk.grey(` ${chalk.green.bold('✔')} Ran git add`));

  // git commit -m 'chore(release): {version}'
  execSync(`${GIT_BIN} commit -m 'chore(release): ${recVersion}'`);
  console.log(
    chalk.grey(
      ` ${chalk.green.bold('✔')} Commited package.json and changelogs to git`
    )
  );

  // git tag -a v{version} -m 'Version {version}'
  execSync(`${GIT_BIN} tag -a v${recVersion} -m 'Version ${recVersion}'`);
  console.log(
    chalk.grey(` ${chalk.green.bold('✔')} Added version tag to commit`)
  );

  // git push && git push --tags
  execSync(`${GIT_BIN} push && ${GIT_BIN} push --tags`, {
    stdio: [ null, 'ignore', null ]
  });
  console.log(chalk.grey(` ${chalk.green.bold('✔')} Pushed to git`));

  // npm publish
  if (ARGS.find((a) => a === '--prerelease' || a === '--pre')) {
    // Don't publish pre-releases with latest tag!
    execSync(`${NPM_BIN} publish --tag=dev`);
    console.log(` ${chalk.green.bold('✔')} Published to npm (--tag=dev)`);
  } else {
    execSync(`${NPM_BIN} publish`);
    console.log(` ${chalk.green.bold('✔')} Published to npm`);
  }
}

if (script === 'publish') {
  run().catch(console.error);
} else {
  console.log(chalk.red.bold(`Unknown command "${script}"`));
}
