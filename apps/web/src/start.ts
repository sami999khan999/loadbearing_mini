import { createMiddleware, createStart } from "@tanstack/react-start";
import { Env } from "~/env.js";
import { SecurityHeaders } from "~/server/security-headers.js";

// Every request the web server answers, routes and `/api/*` alike, leaves with the
// security headers. See apps/web/docs/reference/security-headers.md.
const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next();
  return { ...result, response: SecurityHeaders.apply(result.response, Env.isSecure) };
});

export const startInstance = createStart(() => ({ requestMiddleware: [securityHeaders] }));
