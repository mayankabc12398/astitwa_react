import { Component } from 'react'
import { Alert } from '../controls/layout.jsx'
import { Button } from '../controls/Button.jsx'

/**
 * Contains a screen's failure to that screen.
 *
 * Without this, one throw anywhere in the tree unmounts the whole application: React's
 * default for an uncaught render or lifecycle error is to discard everything, so the user
 * gets a white page with no navigation and no way back. That happened here for real — the
 * Monaco editor's onMount reached for a namespace the ESM build does not define, and the
 * blank page that followed named neither the screen nor the cause.
 *
 * It matters more in a layered product than in an ordinary one. Layers 3, 4 and 5 are
 * written by different people on a different schedule, and a screen that arrives as a plugin
 * must not be able to take the base product down with it. The dependency rule keeps upper
 * layers out of Layer 1's imports; this keeps their failures out of Layer 1's runtime.
 *
 * A boundary catches render, lifecycle and constructor errors only — not those thrown from
 * event handlers or async callbacks, which React does not route here.
 */
export class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // The message on screen stays short; the detail a developer needs goes to the console.
    console.error('Screen failed:', this.props.path ?? '(unknown route)', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="screen-error">
        <Alert tone="error">
          <strong>This screen could not be displayed.</strong>
          <div className="screen-error__detail">{this.state.error.message || String(this.state.error)}</div>
          <div className="screen-error__hint">
            The rest of the application is unaffected — use the menu to go elsewhere, or try again.
          </div>
        </Alert>
        <Button onClick={() => this.setState({ error: null })}>Try again</Button>
      </div>
    )
  }
}
