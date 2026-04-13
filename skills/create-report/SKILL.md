---
name: create-report
description: Create a polished visual report as an HTML artifact with charts, tables, and formatted text. Use when the user asks for a report, dashboard, analysis, or visual summary of data.
---

# Create Report

## When to use
The user wants a polished visual output: a report, dashboard, analysis summary, or formatted document with data.

## Steps

1. **Gather the data** — use search, browser, or recall tools to collect information. Structure it before creating the artifact.

2. **Choose the right artifact type**:
   - **Dashboard with charts** → HTML with Chart.js via CDN
   - **Process/architecture diagram** → Mermaid
   - **Formatted report/document** → HTML with marked.js for markdown rendering
   - **Infographic** → SVG or HTML

3. **Create the artifact** using `create_artifact` with type `html`. Include these CDN scripts as needed:
   - Charts: `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`
   - Markdown: `<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>`
   - Maps: `<script src="https://cdn.jsdelivr.net/npm/leaflet/dist/leaflet.js"></script>`

4. **Design rules**:
   - Dark background: `#0f1117` or `#1a1b26`
   - Light text: `#e2e8f0`
   - Accent colours: use vibrant colours for charts/data
   - System font: `font-family: system-ui, -apple-system, sans-serif`
   - Responsive: use CSS grid/flexbox, test at different widths
   - Include a title bar with the report name
   - Add a "Download" or "Print" button if appropriate

5. **For data-heavy reports**: use `generate_csv` alongside the artifact so the user gets both the visual and the raw data.

6. **Offer follow-ups** via `offer_choices`:
   - "Export as Word document"
   - "Add more data"
   - "Change the chart type"
   - "Download as CSV"

## Chart.js quick reference

```html
<canvas id="myChart"></canvas>
<script>
new Chart(document.getElementById('myChart'), {
  type: 'bar', // bar, line, pie, doughnut, radar, scatter
  data: {
    labels: ['Jan', 'Feb', 'Mar'],
    datasets: [{
      label: 'Revenue',
      data: [12, 19, 3],
      backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'],
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { labels: { color: '#e2e8f0' } } },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
    }
  }
});
</script>
```

## What not to do
- Don't output just text — use the artifact for visual impact
- Don't make tiny charts — use at least 300px height
- Don't forget dark theme — bright backgrounds look bad in chat
- Don't hardcode widths — use percentages and flexbox
