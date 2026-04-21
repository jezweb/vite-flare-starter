---
name: ClawHQ artifact + document generation tools deferred from v1.2
description: Pattern reference for AI-generated SVG/HTML/Mermaid artifacts and Word/Excel/PowerPoint document generation — sourced from ClawHQ but requires Cloudflare Containers infrastructure
type: project
originSessionId: 81a9b605-104d-47c6-90ea-95d42d80f379
---
ClawHQ has a sophisticated artifact + document generation system that we considered porting but deferred from v1.2 because it requires Cloudflare Containers infrastructure (heavyweight for a starter).

**Why:** The user asked about adding artifact features (Word doc, chart, SVG generation). ClawHQ implements this via a separate Python container service that the Worker calls — the Worker can't generate .docx/.pptx natively in the V8 isolate. Adding this to the starter would require: a Cloudflare Container deployment, Python dependencies (python-docx, openpyxl, reportlab), and ~2,000 lines of bridge code. Heavy for a "fork and build" template.

**How to apply:** When a forker needs document generation, point them at:
- `~/Documents/clawhq/src/server/tools/artifact-tools.ts` — create_artifact, edit_artifact, patch_artifact, read_artifact (for SVG/HTML/Mermaid)
- `~/Documents/clawhq/src/server/tools/compute-tools.ts` — generate_pdf, generate_chart, generate_document (Word/Excel/PowerPoint), ocr_image, generate_qr, generate_barcode, generate_calendar_event
- `~/Documents/clawhq/src/server/lib/artifact-engine.ts` — the editing engine

**Lighter alternative for the starter:** Use Anthropic's bundled `pptx`/`xlsx`/`docx`/`pdf` Skills which run in Claude's code execution environment. These are listed in CLAUDE.md as the Cloudflare Sandbox option. Documented in the Skills section.

**ClawHQ approach pattern (if porting):**
1. Deploy a Cloudflare Container with Python
2. Worker calls `container.fetch('/api/compute/...')` with structured request
3. Container generates the file, returns binary, Worker stores in R2
4. Tool returns R2 URL or signed download link

**For now in v1.2:** the `run_python` tool via Cloudflare Sandbox can do the same thing with the right system prompt — agent writes Python code using python-docx/openpyxl, runs it in sandbox, file gets produced. Less polished but functional.
