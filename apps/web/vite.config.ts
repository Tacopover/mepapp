import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// AGPLv3 section 13 requires a running network service to offer its exact
// corresponding source. Baking the commit SHA in at build time (rather than
// reading it at runtime, which a server has no access to) lets the app link
// straight to the exact commit it was built from — see MepSketchApp's footer.
function currentCommitSha(): string {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __MEPAPP_COMMIT_SHA__: JSON.stringify(currentCommitSha()),
  },
});
