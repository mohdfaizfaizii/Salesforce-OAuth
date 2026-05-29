import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    console.error('[errorMiddleware] Caught error:', error);
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    // If it's a server function call, return JSON instead of HTML
    const url = new URL(globalThis.location?.href || 'http://localhost');
    // Note: in server middleware, we don't have easy access to request URL unless passed
    // But we can check if it's a server function by other means or just return JSON if it's not a browser request
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
