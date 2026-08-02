# Tikipedia

Wikipedia as a TikTok-style social media feed

# Try it: [https://jrscott812.github.io/xikipedia](https://jrscott812.github.io/xikipedia)

## About

A modified version of [Xikipedia.org](https://xikipedia.org) as a TikTok-style social feed. This branch is **100% live**: article text, categories, links, and images are fetched on demand from the [MediaWiki Action API](https://www.mediawiki.org/wiki/API:Main_page) for the Wikipedia language you pick in Settings. Narration uses your browser/OS text-to-speech and auto-selects a matching voice when one is installed.

Recommendations (likes, watch history, category scores) stay on your device in `localStorage`, stored separately per language. An internet connection is required to load shorts.

## Languages

Settings → **Wikipedia language** switches the API host (`simple.wikipedia.org`, `en.wikipedia.org`, `es.wikipedia.org`, …). Changing language clears the in-memory feed cache and starts a new live queue for that edition.

## Config data

Large static lists live under `[data/](data/)` so they can be edited without touching app logic:


| File                    | Contents                                             |
| ----------------------- | ---------------------------------------------------- |
| `data/languages.json`   | Wikipedia language picker + range connectors for TTS |
| `data/topics.json`      | Topic groups, noise filters, onboarding categories   |
| `data/speech.json`      | Month/ordinal/number words for date narration        |
| `data/captions.json`    | Caption role colors and labels                       |
| `data/junk-images.json` | Filename patterns to exclude from slideshows         |


Regex patterns are stored as strings and compiled when the app loads.

## JavaScript modules

`app.js` is a small ES-module entry point. Runtime features are separated under
`[js/](js/)` (configuration, shared state, Wikimedia access, profiles, topics,
speech, media, feed, and UI); no bundler or build step is required.

## Hosting

This is a static site (no build step). Serve the repo root over HTTP(S), e.g.:

```sh
python -m http.server 8000
```

All asset paths are relative, so hosting under a subdirectory (`user.github.io/xikipedia/`) works without changes.