import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ErrorBoundary } from './reporting/ErrorBoundary.tsx'
import { ErrorScreen } from './reporting/ErrorScreen.tsx'
import { reportUnexpected, setupRendererReporting } from './reporting/reporting.ts'

// Reporting starts before the app's own code loads, so a failure while that
// code loads, or in the first render, is reported too. It never rejects, and a
// build main has not set it up for does nothing (REPORT-06).
const SETUP_WAIT_MS = 2000

async function start() {
  await Promise.race([
    setupRendererReporting(),
    new Promise<void>((resolve) => setTimeout(resolve, SETUP_WAIT_MS)),
  ])
  const root = createRoot(document.getElementById('root')!)
  try {
    const { default: App } = await import('./App.tsx')
    root.render(
      <StrictMode>
        <ErrorBoundary scope="app">
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (error) {
    // The app's code did not load: say so, rather than leave a blank window.
    root.render(
      <ErrorScreen
        scope="app"
        reportId={reportUnexpected(error)}
        onReload={() => window.location.reload()}
      />,
    )
  }
}

void start()
