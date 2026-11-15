<div align="center">

<img src="docs/logo.svg" width="128" height="128" alt="">

# Korean DeepSeek Harness Kit

**DeepSeek Harness in Korean, and on your phone.**<br>14 plugins, including a Korean language pack, installed with one command.

<p>
  <a href="https://github.com/LYNGMN/dsh-korean/actions/workflows/check.yml"><img alt="check" src="https://img.shields.io/github/actions/workflow/status/LYNGMN/dsh-korean/check.yml?branch=main&style=flat-square&logo=githubactions&logoColor=white&label=check"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/releases/latest"><img alt="release" src="https://img.shields.io/github/v/release/LYNGMN/dsh-korean?style=flat-square&logo=github&color=3F77D8"></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/github/license/LYNGMN/dsh-korean?style=flat-square&color=3D94EE"></a>
  <img alt="macOS" src="https://img.shields.io/badge/platform-macOS-000000?style=flat-square&logo=apple&logoColor=white">
  <a href="https://nodejs.org"><img alt="Node.js" src="https://img.shields.io/badge/node-%E2%89%A522.15-339933?style=flat-square&logo=nodedotjs&logoColor=white"></a>
  <a href="CHANGELOG.md"><img alt="DeepSeek Harness" src="https://img.shields.io/badge/DeepSeek%20Harness-0.2.2--rc.3-3F77D8?style=flat-square"></a>
</p>
<p>
  <a href="https://github.com/LYNGMN/dsh-korean/stargazers"><img alt="stars" src="https://img.shields.io/github/stars/LYNGMN/dsh-korean?style=flat-square&logo=github&color=f5c518"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/forks"><img alt="forks" src="https://img.shields.io/github/forks/LYNGMN/dsh-korean?style=flat-square&logo=github"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/issues"><img alt="issues" src="https://img.shields.io/github/issues/LYNGMN/dsh-korean?style=flat-square&logo=github"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/pulls"><img alt="pull requests" src="https://img.shields.io/github/issues-pr/LYNGMN/dsh-korean?style=flat-square&logo=github"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/commits/main"><img alt="last commit" src="https://img.shields.io/github/last-commit/LYNGMN/dsh-korean?style=flat-square&logo=git&logoColor=white"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/graphs/contributors"><img alt="contributors" src="https://img.shields.io/github/contributors/LYNGMN/dsh-korean?style=flat-square"></a>
  <a href="https://github.com/LYNGMN/dsh-korean/pulls"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-3D94EE?style=flat-square"></a>
</p>

[한국어](README.md) · **English**

[Install](#quick-install) · [Phone](#using-it-from-your-phone) · [Details](#full-install) · [Troubleshooting](#troubleshooting) · [Changelog](CHANGELOG.md)

</div>

A collection of plugins for using DeepSeek Harness (DSH) in Korean. It bundles 14 plugins by LYNGMN, including a Korean language pack, and installs them all with one command. This is not an official DeepSeek project.

Every plugin is named `@lyngmn/dsh-<name>` and gets its own card on the DSH plugins screen, where you can turn it on or off.

## Plugins

<table>
<thead><tr><th width="220">Name</th><th align="left">What it does</th></tr></thead>
<tbody>
<tr>
<td align="center"><img src="plugins/korean/icon.svg" width="40" height="40" alt=""><br><strong>Korean language pack</strong></td>
<td>Translates DSH into Korean and adds font pickers for body text, code and the terminal.</td>
</tr>
<tr>
<td align="center"><img src="plugins/handheld/icon.svg" width="40" height="40" alt=""><br><strong>Phone workspace</strong></td>
<td>Follow sessions and send messages from an app on your phone. Approval requests arrive as notifications, and you allow or deny each one yourself.</td>
</tr>
<tr>
<td align="center"><img src="plugins/subagent-tree/icon.svg" width="40" height="40" alt=""><br><strong>Subagent tree</strong></td>
<td>Nests subagents under their parent session in the sidebar.</td>
</tr>
<tr>
<td align="center"><img src="plugins/enter-keys/icon.svg" width="40" height="40" alt=""><br><strong>Enter key setting</strong></td>
<td>Choose whether Enter sends or starts a new line in the composer, and send Korean text with a single Enter while composing.</td>
</tr>
<tr>
<td align="center"><img src="plugins/plan-view/icon.svg" width="40" height="40" alt=""><br><strong>Plan view</strong></td>
<td>Adds a Plan tab to the conversation views that keeps the agent's todo list and submitted plans on one screen.</td>
</tr>
<tr>
<td align="center"><img src="plugins/git-stage/icon.svg" width="40" height="40" alt=""><br><strong>Work stages</strong></td>
<td>Adds a Work stages tab to the conversation views that shows where the session's Git work stands, from branch to deploy, and what needs your approval next.</td>
</tr>
<tr>
<td align="center"><img src="plugins/footnote-hover/icon.svg" width="40" height="40" alt=""><br><strong>Footnote preview</strong></td>
<td>Shows a footnote's text when you hover over its number.</td>
</tr>
<tr>
<td align="center"><img src="plugins/skill-hints/icon.svg" width="40" height="40" alt=""><br><strong>Skill hints</strong></td>
<td>Shows each skill's argument hint in the composer.</td>
</tr>
<tr>
<td align="center"><img src="plugins/agy-commands/icon.svg" width="40" height="40" alt=""><br><strong>Antigravity commands</strong></td>
<td>Adds <code>/agy</code> commands for plans, goals, interviews, boosts and teamwork.</td>
</tr>
<tr>
<td align="center"><img src="plugins/model-key-failover/icon.svg" width="40" height="40" alt=""><br><strong>Spare model keys</strong></td>
<td>Switches to a spare API key when the current one stops working.</td>
</tr>
<tr>
<td align="center"><img src="plugins/search-brave/icon.svg" width="40" height="40" alt=""><br><strong>Brave Search</strong></td>
<td>Uses the Brave Search API for web search. Requires an API key.</td>
</tr>
<tr>
<td align="center"><img src="plugins/search-exa/icon.svg" width="40" height="40" alt=""><br><strong>Exa Search</strong></td>
<td>Uses the Exa Search API for web search. Requires an API key.</td>
</tr>
<tr>
<td align="center"><img src="plugins/search-fallback/icon.svg" width="40" height="40" alt=""><br><strong>Search fallback</strong></td>
<td>When a search provider fails, retries with the next one.</td>
</tr>
<tr>
<td align="center"><img src="plugins/auto-review-resilience/icon.svg" width="40" height="40" alt=""><br><strong>Auto review recovery</strong></td>
<td>Retries an Auto review that hit a rate limit, then asks for your approval if it still fails.</td>
</tr>
</tbody>
</table>

Card titles appear in Korean when DSH is set to Korean, and in English otherwise.

## Quick install

### Let an AI do it

Paste the prompt below into an AI tool such as DSH, Claude Code or Codex. Before each step, the AI tells you what it is about to do and asks for your permission where needed.

```text
Read https://raw.githubusercontent.com/LYNGMN/dsh-korean/main/docs/install-with-ai.md and follow it to install the Korean DSH kit. Before each step, tell me what you're about to do, and ask for my permission wherever it's needed. Reply in English.
```

To set up phone access as well, add this line at the end:

```text
Also set it up so I can use it from my phone.
```

The AI follows the [AI install guide](docs/install-with-ai.md). The guide is written in Korean, but the AI can follow it and reply in your language.

### Three commands

Run these in a terminal, one at a time:

```bash
git clone https://github.com/LYNGMN/dsh-korean.git ~/dsh-korean
```

```bash
cd ~/dsh-korean
```

```bash
./install.sh
```

When it finishes, quit DSH completely (⌘Q) and reopen it.

## Using it from your phone

With Phone workspace turned on, you can follow DSH sessions, send messages and receive approval requests as notifications on your phone, even when you're away from your Mac. Connections go through a Cloudflare Tunnel, and only people who sign in through Cloudflare Access can get in.

- **The easy way**: add "Also set it up so I can use it from my phone." to the AI prompt above. The AI creates the tunnel, saves the token and settings, and tests the connection.
- **What you need to do yourself**
  1. Sign in to Cloudflare in your browser and choose a domain
  2. Create an Access application in the Cloudflare dashboard (the AI tells you where to click)
  3. Restart DSH
  4. On your phone: open the address → add it to your Home Screen → turn on notifications in Settings
- **Requirements**: a Cloudflare account and a domain on Cloudflare. The tunnel and Access are covered by Cloudflare Zero Trust's free plan; you pay only for the domain.
- **Manual setup**: [Cloudflare guide](plugins/handheld/docs/setup-cloudflare.en.md)

The phone app is available in Korean only.

## Full install

### Requirements

- macOS and the DeepSeek Harness app (`/Applications/DeepSeek Harness.app`)
- Git
- Node.js 22.15 or later, with npm. Phone workspace needs one npm package, which the installer downloads.
- For phone access: a Cloudflare account, a domain on Cloudflare, and `cloudflared` (`brew install cloudflared`)

### 1. Download

```bash
git clone https://github.com/LYNGMN/dsh-korean.git ~/dsh-korean
```

You can clone it anywhere. DSH loads the plugins from this folder, so they stop working if you move or delete it. Keep it where you cloned it.

### 2. Preview

```bash
cd ~/dsh-korean && ./install.sh --dry-run
```

Shows what the installer would do without changing anything: which plugins it would add, which it would remove first, and which npm packages it would download.

### 3. Install

```bash
./install.sh
```

- Missing npm packages are downloaded first, so you need an internet connection.
- If one of these plugins is already installed under a different name, the installer asks before removing it so the two don't conflict. Your settings and keys are kept.
- `--profile <name>` installs into a DSH profile other than Desktop.

### 4. Check

Quit DSH completely (⌘Q) and reopen it. If the plugins screen shows 14 cards with icons, the install worked. To switch DSH to Korean, choose Korean under **Settings → General → Language**.

### Installing a single plugin

On the DSH plugins screen, choose **Add plugin** and enter the absolute path to `plugins/<folder>`, for example `/Users/<you>/dsh-korean/plugins/korean`. Paths that start with `~/` don't work.

### Recommended fonts

The Korean language pack recommends Pretendard for text, D2Coding for code and IBM Plex Mono for the terminal. Fonts are not bundled; install them separately:

```bash
brew install --cask font-pretendard font-d2coding font-ibm-plex-mono
```

Pick fonts in **Settings → General**. Only installed fonts appear in the list.

## Updating

```bash
cd ~/dsh-korean && git pull
```

Then restart DSH. If a new release adds a plugin, run `./install.sh` again.

## Uninstalling

```bash
cd ~/dsh-korean && ./install.sh --remove
```

To turn off just one plugin, switch off its card on the DSH plugins screen.

## Troubleshooting

| Symptom | What to do |
|---|---|
| The cards don't appear | Click refresh on the plugins screen, or quit DSH completely and reopen it. |
| `npm을 찾지 못했어요` (npm not found) | Install Node.js, then run `./install.sh` again. |
| The phone address won't open | See "Check that it works" in the [Cloudflare guide](plugins/handheld/docs/setup-cloudflare.en.md). |
| No notification option on iPhone | Open the app from its Home Screen icon, not from a Safari tab. |

If that doesn't help, open an [issue](https://github.com/LYNGMN/dsh-korean/issues) describing the problem and your DSH version. Don't include personal details such as tokens, email addresses or your phone address.

## For contributors

- Architecture: [docs/architecture.md](docs/architecture.md)
- Contribution rules: [AGENTS.md](AGENTS.md) (in Korean)
- Run all tests: `npm install && npm test`
- Check translations: `npm run check`

## Contributors

<a href="https://github.com/LYNGMN/dsh-korean/graphs/contributors"><img src="https://contrib.rocks/image?repo=LYNGMN/dsh-korean" alt="Contributor list"></a>

## Star history

<a href="https://star-history.com/#LYNGMN/dsh-korean&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=LYNGMN/dsh-korean&type=Date&theme=dark">
    <img alt="Star history chart" src="https://api.star-history.com/svg?repos=LYNGMN/dsh-korean&type=Date" width="600">
  </picture>
</a>

## License

MIT. If a plugin includes its own `LICENSE` or `NOTICE`, those terms apply to that plugin.
