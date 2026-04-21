---
name: csv-analyse
description: Analyse a CSV file in the sandbox — row/column counts, column types, summary statistics for numeric columns, unique value distributions for categorical columns, and missing-value counts. Use when the user asks to explore, summarise, profile, or analyse a CSV file.
compatibility: Requires the Cloudflare Sandbox binding with a Python environment (pandas available).
---

# CSV analyse

## When to use
The user has a CSV file (uploaded, written to the filesystem, or inline) and wants a structured summary or statistical analysis.

Examples:
- "Summarise sales.csv"
- "What columns are in this file and what do they contain?"
- "Give me descriptive stats for the numeric columns"
- "Count missing values per column"

## Steps

1. **Locate the CSV.** If the user mentioned a filename, call `fs_list` and `fs_read` under `uploads/` or their chosen folder to get the content as a string. If the content is in a previous tool result or an attachment, pass it directly as `stdin`.

2. **Run the bundled analyser.** Call:
   ```
   run_skill_script({
     name: "csv-analyse",
     path: "scripts/analyse.py",
     stdin: <the CSV content as a string>
   })
   ```
   The script reads stdin, uses pandas to profile the data, and prints a JSON report to stdout.

3. **Parse the JSON.** The stdout is a single JSON object with keys: `shape`, `columns`, `dtypes`, `missing`, `numeric_summary`, `categorical_summary`, `head`. Show the user the bits they asked for — don't dump the whole thing unless they asked for "everything".

4. **Offer follow-ups.** Use `offer_choices` with 3-5 relevant next steps, e.g.:
   - "Plot the distribution of [numeric column]"
   - "Filter rows where [condition]"
   - "Export the summary to a Word document"
   - "Correlate these columns"

## Style

- Present the shape (rows × cols) first — it's the most useful single fact.
- Show missing-value percentages only where > 0.
- Round numeric summaries to 3 significant figures.
- If the file is big (>10k rows), mention that analysis used the full file, not a sample.

## What not to do

- Don't guess column meanings. If a column name is ambiguous, ask the user.
- Don't dump the full CSV back in the chat. The user already has it.
- Don't run the analysis if the input looks like it's not a CSV (check for delimiters in the first line). Ask for clarification instead.
