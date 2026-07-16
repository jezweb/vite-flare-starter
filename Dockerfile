# Cloudflare Sandbox container image — backs the run_python / run_shell /
# run_js / generate_document chat tools (src/server/modules/chat/tools/code.ts).
#
# ⚠ Version sync: the base image tag MUST match the @cloudflare/sandbox npm
#   version in package.json (currently 0.12.3). The SDK checks compatibility
#   on startup and mismatches break features. Bump both together.
#
# The -python variant ships Python 3.11 + numpy/pandas/matplotlib/ipython.
# We add the document-generation libs that generate_document depends on.
#
# Docker must be running locally when you `pnpm run deploy` — wrangler builds
# and pushes this image to Cloudflare's registry on deploy.
FROM docker.io/cloudflare/sandbox:0.12.3-python

# Document generation (generate_document tool): Word / Excel / PowerPoint.
# Bare `pip` isn't on PATH in this image — use `python3 -m pip` (pip3 also works).
RUN python3 -m pip install --no-cache-dir python-docx openpyxl python-pptx
