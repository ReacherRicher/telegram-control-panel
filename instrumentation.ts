// Runs once when the Next.js server starts.
// With EMBEDDED_WORKER=true the web server also executes background jobs, so a separate
// `npm run worker` process is not needed (handy for `npm run dev`). Never enable both.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.EMBEDDED_WORKER === 'true') {
    const { startWorkerLoop } = await import('./server/jobs/worker-loop');
    startWorkerLoop();
  }
}
