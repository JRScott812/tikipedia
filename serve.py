#!/usr/bin/env python3
"""Drop-in for `python -m http.server` with SPA deep-link fallback (like GitHub Pages)."""

from __future__ import annotations

import argparse
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
APP_PAGES = ("profiles", "stats", "settings", "about", "following")
# /p/{lang}/{slug} or legacy /p/{slug} — not /p/icons/... asset mistakes
POST_ROUTE_RE = re.compile(
	r"^/p/(?:[a-z]{2,12}/)?[^/]+/?$",
	re.IGNORECASE,
)


class SpaHandler(SimpleHTTPRequestHandler):
	def __init__(self, *args, **kwargs):
		super().__init__(*args, directory=str(ROOT), **kwargs)

	def do_GET(self):
		parsed = urlparse(self.path)
		path = unquote(parsed.path)

		if path == "/favicon.ico" or path.endswith("/icons/favicon.svg"):
			self.send_response(302)
			self.send_header("Location", "/favicon.svg")
			self.end_headers()
			return

		file_path = Path(self.translate_path(self.path))
		if file_path.is_file():
			return super().do_GET()

		first = path.strip("/").split("/", 1)[0].lower() if path.strip("/") else ""
		if first in APP_PAGES or POST_ROUTE_RE.match(path):
			self.path = "/404.html"
			return super().do_GET()

		return super().do_GET()


def main() -> None:
	parser = argparse.ArgumentParser(description=__doc__)
	parser.add_argument(
		"port",
		nargs="?",
		type=int,
		default=8000,
		help="port number (default: 8000)",
	)
	parser.add_argument("--bind", "-b", default="", metavar="ADDRESS",
		help="bind address (default: all interfaces, same as http.server)")
	args = parser.parse_args()
	server = ThreadingHTTPServer((args.bind, args.port), SpaHandler)
	print(f"Serving HTTP on {args.bind or '::'} port {args.port} (http://127.0.0.1:{args.port}/) ...")
	try:
		server.serve_forever()
	except KeyboardInterrupt:
		print("\nKeyboard interrupt received, exiting.")


if __name__ == "__main__":
	main()
