# Public Assets

Static files that are served directly without processing.

## Structure

```
public/
├── favicon.ico           # Site favicon
├── robots.txt           # Search engine instructions
├── images/              # Static images
├── fonts/               # Custom fonts (if not using CDN)
└── [other static files]
```

## Usage

Files in this directory are:
- Copied as-is to the `dist/` folder during build
- Served as static assets from Cloudflare's edge
- **FREE** to serve (no Worker invocation cost)

## Referencing Assets

In your code, reference public assets with absolute paths:

```tsx
// React component
<img src="/images/logo.png" alt="Logo" />

// CSS
background-image: url('/images/hero.jpg');
```

## Asset Optimization

For images that need optimization:
- Use Cloudflare Images (paid service)
- Or pre-optimize images before placing in public/
- Consider WebP format for better compression

## Best Practices

- Keep files small (use CDNs for large assets)
- Use descriptive filenames
- Organize by type (images/, fonts/, etc.)
- Don't commit large binary files if possible
