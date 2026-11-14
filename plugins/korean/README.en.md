# dsh-korean

A Korean language pack for DeepSeek Harness (DSH). It is not an official DeepSeek language pack.

[한국어](README.md)

- It does not modify the app. Korean is added through the language-pack API that DSH exposes to plugins.
- It survives app updates. Strings introduced by a newer version stay in English until the pack is updated.
- Disabling or removing the plugin restores the original UI.


## Supported versions

| DSH version | Status |
|---|---|
| 0.2.2-rc.2 (macOS) | Translated against this version's UI dictionaries |

## Install

The pack ships in the Korean DSH kit: clone the kit and run `./install.sh` at its root to install it with the other plugins.

To install only this pack:

1. In DSH, open **Plugins → Add plugin**.
2. Enter the **absolute path** of `plugins/korean` inside the kit folder, then install. Paths starting with `~/` are read as package names and fail.
3. Choose **한국어** under **Settings → General → Language**.

## What stays in English

The pack can only change DSH's UI dictionaries. The macOS menu bar, tray menu, update and welcome windows, raw Host error messages, built-in plugin card titles, other plugins' UI, and `dsh` CLI output remain in English. See [docs/untranslated.md](docs/untranslated.md).

## Development

```bash
node scripts/extract.mjs
```

```bash
node scripts/check.mjs
```

```bash
node scripts/build.mjs
```

`extract` reads the English dictionaries from the installed app without unpacking or writing to it. `check` validates `ko/*.json` and `packages/ko.json` (titles and descriptions of built-in plugin cards) against that snapshot (missing or unknown keys, placeholder mismatches, empty values, invisible characters, untranslated values, glossary terms). `build` writes `lib/client.js` only when the check passes.

## Font picker

The pack also adds rows under Settings → General for choosing the text, code and terminal fonts from a list. Only candidate fonts installed on the device are listed; no font files are shipped. The recommended fonts are Pretendard (text), D2Coding (code) and IBM Plex Mono (terminal): on first run, a role still on the DSH default switches to its recommended font once if that font is installed. The choice is stored in DSH's own font settings.

## License

MIT. English strings under `source/` come from DeepSeek Harness (MIT, © 2026 DeepSeek); see [NOTICE](NOTICE).
