#!/usr/bin/env python3
"""Generate Walkabout tour narration MP3s + spotlight cue timings via ElevenLabs.

Each step's script is a list of (selector, text) SEGMENTS. The segments are
joined into one narration take, generated through the /with-timestamps endpoint
(character-level alignment), and each segment's start second is computed from the
alignment — so the on-page spotlight moves to the matching element exactly as the
voice reaches it. No hand-timing; survives any re-record.

Outputs:
  public/tour/step-N.mp3                              — the narration
  src/client/modules/walkabout/tour/cues.gen.ts       — { 'step-N': [{selector, at}] }

Voice: Charlie (IKne3meq5aSn9XLyUdCD) — ElevenLabs' Australian male,
conversational. Re-run after editing scripts; files are overwritten. Keep the
SCRIPTS keys (step-N) matching the `audio` filenames in tour/steps.ts and the
`data-tour` attributes on the real pages.
"""
import base64
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
SECRETS = pathlib.Path.home() / 'Documents/.jez/secrets/elevenlabs-jezweb-com.md'
KEY = re.search(r'sk_[a-f0-9]{40,}', SECRETS.read_text()).group(0)
VOICE = 'IKne3meq5aSn9XLyUdCD'  # Charlie — Australian, conversational
OUT = ROOT / 'public/tour'
OUT.mkdir(parents=True, exist_ok=True)
CUES_TS = ROOT / 'src/client/modules/walkabout/tour/cues.gen.ts'

# (selector | None, text) — selector None narrates without moving the spotlight.
SCRIPTS: dict[str, list[tuple[str | None, str]]] = {
    'step-1': [
        ('[data-tour="home-welcome"]',
         "Welcome! This is your Home — the first thing you see when you sign in. "
         "It greets you and gives you a snapshot of what's on."),
        ('[data-tour="home-panels"]',
         "These panels show what needs you — anything waiting on a yes or no — "
         "and what your agents have been up to, so you pick up where you left off."),
        ('[data-tour="home-actions"]',
         "Quick actions drop you straight into the common jobs. Everything else "
         "lives in the sidebar on the left — let's take a look."),
    ],
    'step-2': [
        ('[data-tour="chat-input"]',
         "This is AI Chat — the heart of the app. Type here and the agent answers, "
         "calls tools, reads your skills and memory, and shows rich results right "
         "in the conversation. It's where most of the work happens."),
    ],
    'step-3': [
        ('[data-tour="skills-list"]',
         "Skills are how you teach the agent. Each one's a short markdown file "
         "describing a procedure the agent loads only when it's relevant. Edit one "
         "and the AI Sparkle button rewrites it for you, with a diff to approve."),
    ],
    'step-4': [
        ('[data-tour="knowledge-list"]',
         "Knowledge is your long-form reference — docs the agent can search or bake "
         "into every prompt. It sits between small memories and step-by-step skills."),
    ],
    'step-5': [
        ('[data-tour="inbox-list"]',
         "The Inbox is your one place to pay attention. Things the agent noticed, "
         "and anything it wants you to approve, all in one list, most important first. "
         "Approvals open right here, no jumping around."),
    ],
    'step-6': [
        ('[data-tour="projects-list"]',
         "Projects organise the work. Group your conversations and give each project "
         "its own memory, system prompt, and default model — so the agent shows up "
         "already knowing the context."),
    ],
    'step-7': [
        ('[data-tour="routines-list"]',
         "Routines are recurring agents. Fire one on a schedule with a tools "
         "allow-list and loaded skills, and its findings flow to the channels you "
         "pick — the inbox, a notification, or an approval queue."),
    ],
    'step-8': [
        ('[data-tour="agents-list"]',
         "These are the agents the app ships with — each one self-describing. "
         "They're stateful: a persona with memory, tools, and a human-in-the-loop "
         "approval queue for anything that matters."),
    ],
    'step-9': [
        ('[data-tour="activity-list"]',
         "Activity is the audit trail — every action on the account, with stats by "
         "type and a full history. Nothing your agents do is a black box."),
    ],
    'step-10': [
        ('[data-tour="connections-list"]',
         "Connections plug in your tools — Gmail, Drive, Notion, Slack and more, "
         "over the open MCP standard. Each connection is labelled and allow-listed "
         "per agent, so work and personal accounts stay separate."),
    ],
    'step-11': [
        ('[data-tour="files-list"]',
         "Files is your document store — upload to the cloud, scope to a project, "
         "preview inline. The agent can read them, and the meter tracks your storage."),
    ],
    'step-12': [
        ('[data-tour="org-members"]',
         "And it's multi-tenant from day one. Invite your team, manage roles, and "
         "switch between your personal space and shared organisations."),
    ],
    'step-13': [
        ('[data-tour="settings-tabs"]',
         "Last stop — Settings, where you make it yours: profile, theme, sessions, "
         "and a full export of your data. That's the tour! Have a click around — "
         "everything you're seeing is yours to explore."),
    ],
}


def segment_starts(alignment: dict, full_text: str, offsets: list[int]) -> list[float]:
    """Start second for each segment, from character-level alignment.

    The alignment's characters normally mirror the input text 1:1; if the API
    normalised differently, fall back to a proportional estimate over the total
    duration — close enough for a spotlight.
    """
    chars = alignment['characters']
    starts = alignment['character_start_times_seconds']
    if len(chars) == len(full_text):
        return [starts[min(o, len(starts) - 1)] for o in offsets]
    total = alignment['character_end_times_seconds'][-1]
    return [total * o / len(full_text) for o in offsets]


cues: dict[str, list[dict]] = {}
for name, segments in SCRIPTS.items():
    texts = [t for _, t in segments]
    full_text = ' '.join(texts)
    # Character offset where each segment begins in the joined text.
    offsets, pos = [], 0
    for t in texts:
        offsets.append(pos)
        pos += len(t) + 1  # the joining space

    body = json.dumps({
        'text': full_text,
        'model_id': 'eleven_turbo_v2_5',
        'voice_settings': {'stability': 0.5, 'similarity_boost': 0.75, 'style': 0.3},
    }).encode()
    req = urllib.request.Request(
        f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_64',
        data=body,
        headers={'xi-api-key': KEY, 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read())

    audio = base64.b64decode(payload['audio_base64'])
    (OUT / f'{name}.mp3').write_bytes(audio)

    starts = segment_starts(payload['alignment'], full_text, offsets)
    cues[name] = [
        {'selector': sel, 'at': round(at, 2)}
        for (sel, _), at in zip(segments, starts)
        if sel is not None
    ]
    print(f'{name}.mp3 {len(audio)//1024}KB  cues: {[(c["selector"], c["at"]) for c in cues[name]]}')

CUES_TS.write_text(
    '// GENERATED by .jez/scripts/gen-tour-audio.py — do not edit by hand.\n'
    '// Spotlight cue timings: each entry moves the halo to `selector` when the\n'
    '// step narration reaches `at` seconds. Regenerate whenever scripts change.\n'
    'export interface TourCue {\n  selector: string\n  at: number\n}\n\n'
    'export const TOUR_CUES: Record<string, TourCue[]> = '
    + json.dumps(cues, indent=2)
    + '\n'
)
print(f'wrote {CUES_TS.relative_to(ROOT)}')
