# xikipedia
Wikipedia as a TikTok-style social media feed

# Try it: [xikipedia.org](https://jrscott812.github.io/xikipedia)

## About

A modified version of [Xikipedia.org](https://xikipedia.org) but as a TikTok-style social feed, with videos.  All text & images come from the Wikipedia data dumps.  The voice uses the Text-to-Speech (TTS) from the browser/OS and can be changed in the settings.

Once Xikipedia has loaded, it is available fully offline, and you can even install it as an app by clicking the install button.

## Generating data

To run Xikipedia, you need the .json file that contains the data required. This repo already has a file for the Simple Wikipedia included, but you can also make your own by replacing the files in the `process_data.py` file with your own [WikiMedia data dumps](https://dumps.wikimedia.org/).

## Hosting

The app tries the dataset in this order and uses whichever the host has: `smoldata.json`, then `smoldata.json.gz`, then `smoldata.json.br`. The compressed ones are decompressed in the browser, so the archives are sniffed rather than trusted by extension — a host that sets `Content-Encoding` itself (like nginx serving `smoldata.json.br` as `smoldata.json`) still works.

On static hosts such as GitHub Pages, the uncompressed 228MB `smoldata.json` can't be committed (over GitHub's file size limit) and browsers can't decode brotli via `DecompressionStream`, so `smoldata.json.gz` is what gets used. Regenerate it after changing the dataset:

```sh
gzip -9 -k smoldata.json  # writes smoldata.json.gz
```

Then update `EXPECTED_GZ_SIZE` in `app.js` and `simple` in `version.json` to the new sizes. All paths are relative, so serving from a subdirectory (`user.github.io/xikipedia/`) works without changes.
