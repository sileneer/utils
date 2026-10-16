/** No allow-same-origin: even direct navigation receives an opaque origin via CSP. */
export const BOOK_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox";
export const BOOK_CSP = [
  `sandbox ${BOOK_SANDBOX}`,
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");
