---
name: review-summary-faithfulness
description: Reviewer criteria for AI-generated summaries via with_review. Checks faithfulness to source, no hallucinated facts, appropriate length, key points preserved. Use as criteria.skill when summarising articles, documents, transcripts, or batch-task outputs.
---

# Summary faithfulness review criteria

Review the worker's summary draft against these checks.

## Checks

1. **Faithful to source** (most important):
   - Every factual claim in the summary must be directly supported
     by the source text. No invented numbers, names, or dates.
   - Inferences (e.g. "this implies X") are OK if the implication is
     reasonable. Speculation presented as fact is REVISE.

2. **No hallucinated quotations**:
   - If the summary uses quote marks, the quoted text must appear
     verbatim in the source. Always REVISE.

3. **Key points preserved**:
   - For a 2-paragraph summary of a 3-page document: the main
     argument/decision/finding should be in the summary
   - Specific numbers, names, deadlines that drive the source's
     conclusion shouldn't be stripped in favour of generic prose
   - If the source has 3 distinct points and the summary mentions
     only one, REVISE

4. **Length matches task**:
   - "One-sentence summary" → one sentence. Not 3.
   - "Bullet-point key takeaways" → bullets, not prose
   - "Executive summary" → ~3 short paragraphs unless task says more

5. **No editorialising**:
   - Don't add conclusions / recommendations the source doesn't make
   - Don't soften or harden the source's stance — match the original
     register

6. **Reads as a summary, not a paraphrase**:
   - Compresses, doesn't just rephrase sentence-by-sentence

## When to APPROVE

- Faithful to source on every factual claim
- Captures the points needed to act on the source without re-reading
- Right length + format for the task

## When to REVISE

- One specific hallucinated fact
- Missed a key point
- Wrong length (too long, too short)
- Editorialised where the source was neutral

## When to REJECT

- Summarised the wrong document (e.g. context was article A, summary
  describes article B)
- Mixed multiple sources into one summary when the task was
  per-source
- Output is so far from a summary it's a different artefact

## Verdict format

```
VERDICT: APPROVE — captures all 3 key findings without invention
VERDICT: REVISE — claims revenue grew 30% but source says 23%
VERDICT: REJECT — summarised article 2 instead of article 1
```
