import './nhr-theme.css'
import './nhr-components.css'

/**
 * The boundary of the ported design system.
 *
 * Every rule in nhr-theme.css and nhr-components.css is written under `.nhr-scope`, and the
 * keyframes are prefixed, so the theme cannot reach the app shell or any screen built from
 * src/core/controls. Wrapping a screen in this component is what turns the theme on for it;
 * nothing else in the product changes.
 *
 * That containment is the whole reason two design languages can live in one application.
 * A rule that escapes the scope would restyle every existing screen, so a stylesheet added
 * here must stay scoped — the source file says the same thing in its own header.
 */
export function NhrScope({ children, className = '' }) {
  return <div className={`nhr-scope ${className}`.trim()}>{children}</div>
}
