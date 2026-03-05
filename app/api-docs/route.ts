import { NextResponse } from "next/server";

export const GET = async () => {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Docs — Cloud Services</title>
    <style>html,body,#app{height:100%;margin:0}#app{display:flex;flex-direction:column}</style>
  </head>
  <body>
    <div id="app"></div>

    <!-- Scalar API Reference (CDN) -->
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      // Initialize the Scalar UI and point to the local OpenAPI file
      Scalar.createApiReference('#app', {
        url: '/openapi.json',
      });
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
};
