export function renderExtensionErrorHtml(title: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body {
            margin: 0;
            padding: 12px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            font-size: 12px;
            line-height: 1.5;
          }

          h1 {
            margin: 0 0 8px;
            font-size: 13px;
          }

          pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            color: var(--vscode-errorForeground);
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <pre>${escapeHtml(message)}</pre>
      </body>
    </html>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
