# A2A Utils

A collection of utilities for discovering, communicating, and authenticating with A2A Servers (remote agents).

Python is published to [PyPI](https://pypi.org/project/a2a-utils/) as `a2a-utils`.
JavaScript is published to [npm](https://www.npmjs.com/package/@a2anet/a2a-utils) as `@a2anet/a2a-utils`.

Both languages always share the same version number — a change to either bumps the version for both.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) installed
- [Bun](https://bun.sh/) installed

### Cursor

- [Cursor](https://cursor.com/en)
- Prettier
- Ruff
- Mypy (by matangover NOT ms-python)
- Biome

### VSCode

- [VSCode](https://code.visualstudio.com/)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- [Ruff](https://marketplace.visualstudio.com/items?itemName=charliermarsh.ruff)
- [Mypy](https://marketplace.visualstudio.com/items?itemName=matangover.mypy)
- [Biome](https://marketplace.visualstudio.com/items?itemName=biomejs.biome)

### Claude Code

- [Claude Code](https://code.claude.com/docs/en/overview)

## Getting Started

```bash
make install   # installs Python and JavaScript dependencies
make lint      # ruff + biome
make typecheck # mypy + tsc
make test      # pytest + bun test
```

## CI/CD

This project includes GitHub Actions workflows for continuous integration and release automation.

### Workflows

| Workflow              | Trigger                         | Description                                                            |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| **CI — Python**       | Push/PR to main touching `python/`     | Runs ruff, mypy, and pytest with coverage                              |
| **CI — JavaScript**   | Push/PR to main touching `javascript/` | Runs Biome, TypeScript, and Bun test with coverage                     |
| **Release Please**    | Push to main                    | Creates a single release PR for both languages and publishes to PyPI + npm |

CI workflows are path-filtered — a PR touching only `python/` will only trigger Python CI, and vice versa.

### Conventional Commits

This project uses [release-please](https://github.com/googleapis/release-please) for automated releases. Use [conventional commits](https://www.conventionalcommits.org/) to trigger version bumps.

| Commit prefix | Version bump  | Description                                         |
| ------------- | ------------- | --------------------------------------------------- |
| `feat!:`      | Major (x.0.0) | Breaking changes that require major version bump    |
| `feat:`       | Minor (0.x.0) | New features that add functionality                 |
| `fix:`        | Patch (0.0.x) | Bug fixes                                           |
| `perf:`       | Patch (0.0.x) | Performance improvements                            |
| `build:`      | None          | Build system or dependency changes                  |
| `chore:`      | None          | Maintenance tasks that don't affect production code |
| `ci:`         | None          | CI/CD configuration changes                         |
| `docs:`       | None          | Documentation updates                               |
| `refactor:`   | None          | Code restructuring without behavior changes         |
| `revert:`     | None          | Reverting previous commits                          |
| `style:`      | None          | Code formatting changes                             |
| `test:`       | None          | Adding or updating tests                            |

### Releases

1. Make commits using conventional commit format
2. Push to `main` branch
3. Release Please automatically creates/updates a single Release PR that bumps the version in both `python/` and `javascript/`
4. When ready, merge the Release PR
5. A GitHub Release is created and (if configured) the packages are published to both PyPI and npm automatically

### Publishing

#### Python (PyPI)

To enable PyPI publishing:

1. **Create a PyPI account** at https://pypi.org

2. **Publish the first version manually** — this keeps PyPI in sync with npm (both start at 0.1.0, then release-please takes over at 0.2.0):

   ```bash
   cd python
   uv build
   uv publish
   ```

3. **Add Trusted Publisher on PyPI**:

   - Go to https://pypi.org/manage/project/a2a-utils/settings/publishing/
   - Add a new Trusted Publisher:
     - **Owner**: a2anet
     - **Repository**: a2a-utils
     - **Workflow name**: `release-please.yml`
     - **Environment name**: `pypi`

4. **Create GitHub Environment**:

   - Go to your repo Settings → Environments
   - Create a new environment named `pypi`

#### JavaScript (npm)

To enable npm publishing:

1. **Create an npm account** at https://www.npmjs.com

2. **Publish the first version manually** — Trusted Publishing requires the package to already exist on npm:

   ```bash
   cd javascript
   npm publish --access public
   ```

3. **Add Trusted Publisher on npm**:

   - Go to `https://www.npmjs.com/package/@a2anet/a2a-utils/access`
   - Under "Publishing access", click "Add trusted publisher" → GitHub Actions
   - Set the following:
     - **Owner/Organization**: a2anet
     - **Repository**: a2a-utils
     - **Workflow filename**: `release-please.yml`
     - **Environment**: `npm`

4. **Create GitHub Environment**:

   - Go to your repo Settings → Environments
   - Create a new environment named `npm`

5. **(Optional) Lock down token access**: On the npm package settings, select "Require two-factor authentication or an automation or trusted publishing access token" to prevent classic token usage

#### Disable Publishing

If you don't want to publish, remove the `build-python`, `publish-python`, `build-javascript`, and `publish-javascript` jobs from `.github/workflows/release-please.yml`. No secrets need to be removed — both PyPI and npm use Trusted Publishing (OIDC), so there are no tokens to clean up. The release workflow will still create GitHub releases with changelogs.

### GitHub Repository Settings

#### Branch Protection Rules

Protect your `main` branch to prevent accidental pushes and ensure code quality:

1. Go to Settings → Branches → Add classic branch protection rule
2. Branch name pattern: `main`
3. Enable the following:
   - **Require a pull request before merging**
     - Require approvals: 1
     - Dismiss stale pull request approvals when new commits are pushed
   - **Require status checks to pass before merging**
     - Require branches to be up to date before merging
     - Add status checks (after your first CI run):
       - `Lint & Format` (from both CI workflows)
       - `Type Check` (from both CI workflows)
       - `Test` (from both CI workflows)
   - **Require linear history**

These rules ensure all code goes through PR review and passes CI checks before merging to `main`.

#### Pull Request Settings

Enforce linear history and clean commits:

1. Go to Settings → General → Pull Requests
2. Check the following:
   - Allow squash merging
   - Automatically delete head branches
3. Uncheck the following:
   - Allow merge commits
   - Allow rebase merging

This ensures every PR becomes a single, clean commit on `main` with a proper conventional commit message.

#### Workflow Permissions

Configure GitHub Actions permissions to allow Release Please to create pull requests:

**For personal repositories:**

1. Go to repository Settings → Actions → General
2. Scroll down to **Workflow permissions**
3. Select **"Read and write permissions"**
4. Check **"Allow GitHub Actions to create and approve pull requests"**
5. Click **Save**

**For organization repositories:**

If the workflow permissions option is greyed out in your repository settings, you need to configure this at the organization level:

1. Go to your **organization** Settings → Actions → General (requires organization owner permissions)
2. Scroll down to **Workflow permissions**
3. Select **"Read and write permissions"**
4. Check **"Allow GitHub Actions to create and approve pull requests"**
5. Click **Save**

Without these settings, the Release Please workflow will fail with: `GitHub Actions is not permitted to create or approve pull requests`

### Claude Code GitHub Actions

Enable Claude to respond to `@claude` mentions in PRs and issues:

```bash
claude
/install-github-app
```

This installs the Claude GitHub App and configures the workflow. Once set up, mention `@claude` in any PR or issue comment to get AI assistance with code reviews, bug fixes, and feature implementation.

## Project Structure

```
a2a-utils/
├── .github/
│   └── workflows/
│       ├── ci-python.yml          # Python: lint, typecheck, test (path-filtered)
│       ├── ci-javascript.yml      # JavaScript: lint, typecheck, test (path-filtered)
│       └── release-please.yml     # Unified releases + PyPI & npm publishing
├── python/
│   ├── src/
│   │   └── a2a_utils/
│   │       ├── __init__.py
│   │       └── __about__.py       # Version (updated by release-please)
│   ├── tests/
│   │   ├── __init__.py
│   │   └── test_version.py
│   └── pyproject.toml
├── javascript/
│   ├── src/
│   │   └── index.ts               # Main entry point (version updated by release-please)
│   ├── tests/
│   │   └── index.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── biome.json
├── .vscode/
│   └── settings.json
├── .gitignore
├── .prettierrc
├── release-please-config.json
├── .release-please-manifest.json
├── Makefile
├── LICENSE
└── README.md
```
