# Designing

The process that fills [`DESIGN_BRIEF.md`](./DESIGN_BRIEF.md). The brief
is the record; this is how you produce what goes in it. It comes from a
real client redesign that round-tripped once, end to end. Run it during
FORKING.md Part 0, before any product surface exists. Seven steps, in
order: each produces an artifact the next one consumes.

## 1. Design from the lives, not the screens

Write one card per user × context × light: "cleaner, corridor, one hand,
gloves". Each card ends with what that life demands of the UI: bigger
targets, glare-proof contrast, no hover-only affordances. The output is
a small stack of lives cards, and they feed the brief directly: the
Layout shape and Component posture slots in DESIGN_BRIEF.md are answered
from these cards, not invented at the keyboard. This prevents designing
for the person at the demo desk instead of the person doing the job.

## 2. Extract the palette with provenance

Pull every colour from the client's real brand material: site, socials,
print. Each colour gets provenance, the exact place it came from ("deep
teal ← their headline"). "Roughly blue" is not provenance. The output is
the filled palette table in DESIGN_BRIEF.md; this step and that section
are the same work. This prevents a palette that drifts from the brand
because nobody can say where any value came from.

## 3. Compress the system to one sentence

State the whole colour system in a single sentence with strict roles:
"teal is work, brass is proof, clay needs hands". A colour is a
sentence; breaking it anywhere breaks it everywhere, and that rule is
what makes it a system rather than a palette. Write the sentence into
the brief, in the signature-move slot or on its own line above the
palette table. This prevents colours becoming decoration that any
surface can grab for any reason.

## 4. Name the signature moves

List the handful of moves that make this design this design: a masthead
grammar, edge rails, earned accents, one animation flourish at most.
Named moves are what separate designed from restyled; a palette swap on
stock components has zero of them. The output is a short named list you
will recognise on every future surface. This prevents the finished app
reading as the component library with new colours.

## 5. Define the primitives vocabulary

Before touching any page, define the roughly six components every
surface will consume: the card, the rail, the badge, the header, and so
on, each carrying the system from steps 3 and 4. Pages then compose
primitives instead of inventing local variants. This prevents per-page
bespoke drift, where five screens each solve the same problem slightly
differently and the system dissolves.

## 6. Publish the spec in the system it specifies

Render the spec as a page built in the system itself: live swatches,
type specimens, working primitives from step 5, not a document about
them. The human approves this page BEFORE implementation starts. A spec
that renders in its own system cannot hide a bad decision behind prose.
This prevents approving a description of a design and discovering the
design itself much later, mid-build.

## 7. Verify contrast by computation

Run a script over the actual token values and compute the contrast
ratios; never accept claimed numbers, including your own. Evidence: the
spec that produced this process claimed its numbers, and a script found
three real AA failures the claims missed, one of them already shipped.
The output is a pass/fail table checked into the repo alongside the
brief. This prevents shipping text that fails the very lives you wrote
cards for in step 1.

---

Done means: every DESIGN_BRIEF.md slot filled, the spec page approved,
and the contrast script green. Then, and only then, build the first
product surface (FORKING.md Step 0.4 onward).
