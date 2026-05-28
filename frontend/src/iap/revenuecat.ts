// Default fallback — should never actually be picked because Metro prefers
// `.native.ts` / `.web.ts`. Exporting the web stub is safest if it ever is.
export { default } from "./revenuecat.web";
