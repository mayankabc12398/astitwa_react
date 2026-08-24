import { transformAsync } from '@babel/core'
import locatorJsxModule from '@locator/babel-jsx/dist/index.js'

/** CJS with `exports.default`; Node's interop hands back the whole module object. */
const locatorJsxPlugin = locatorJsxModule.default ?? locatorJsxModule

/**
 * Makes the LocatorJS browser extension work on this project.
 *
 * LocatorJS lets you Alt-click an element in the running app and jump to the line that drew
 * it. To do that it needs to know which file each element came from.
 *
 * It normally reads that from the React fiber, but React 19 no longer keeps it there, so the
 * extension reports "No source info found for this element!". The supported fallback is a
 * Babel plugin that stamps the file and line onto the DOM as data-locatorjs-id.
 *
 * That plugin is usually passed through @vitejs/plugin-react's `babel` option — but this
 * project is on plugin-react 6, the Rolldown build, which transforms JSX with oxc and has no
 * `babel` option at all. Passing one is accepted and silently ignored, which is exactly what
 * happened first time round: the config looked right and nothing reached the DOM.
 *
 * So the transform runs here instead, as its own plugin, before the JSX transform. Babel is
 * used only to add attributes: JSX goes in and JSX comes out, with no presets, so oxc still
 * does the actual compiling afterwards.
 *
 * Dev server only — `apply: 'serve'`. data-locatorjs-id contains the source path of every
 * element, which has no business being in a production page.
 */
export function locatorJs() {
  return {
    name: 'demo-hospital:locatorjs',
    apply: 'serve',
    enforce: 'pre',

    async transform(code, id) {
      const [file] = id.split('?')
      if (!file.endsWith('.jsx')) return null
      if (file.includes('/node_modules/')) return null

      const result = await transformAsync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        // Parse JSX, but transform nothing: the only plugin is the one adding attributes.
        parserOpts: { plugins: ['jsx'] },
        plugins: [[withPosixPaths(locatorJsxPlugin), { env: 'development' }]],
      })

      if (!result?.code) return null
      return { code: result.code, map: result.map }
    },
  }
}

const toPosix = (p) => (typeof p === 'string' ? p.split('\\').join('/') : p)

/**
 * Wraps the LocatorJS Babel plugin so it only ever sees forward-slash paths.
 *
 * The plugin emits its registry by building a line of SOURCE TEXT and re-parsing it, with the
 * file path dropped in unescaped:
 *
 *     window.__LOCATOR_DATA__["D:\Astitwa\react\src\...\Employee.jsx"] = { ... }
 *
 * On a POSIX path that is harmless. A Windows path is read as escape sequences and eaten, so
 * the key that comes out is not the key that went in — it became "D:Astitwa" and a mangled
 * tail while the attribute on the element still held the real path. The extension looks the
 * element up, misses, and reports "No source info found for this element!" with everything
 * apparently wired correctly. Worse, a path containing a backslash followed by u or x — say
 * src\config\nhr\ui\charts.jsx — is not merely mangled: it fails to parse, and the file dies
 * with "Bad character escape sequence".
 *
 * The path cannot be fixed on the way in. Babel resolves `filename` to an absolute path with
 * `path.resolve`, which on Windows returns backslashes whatever we hand it, and `cwd` comes
 * from process.cwd(). Nor can the output be repaired afterwards: when the path breaks the
 * parse, the plugin throws and there is no output to repair.
 *
 * So the paths are rewritten on the plugin's own PluginPass, which Babel creates one of per
 * plugin, at the single point the plugin reads them — Program.enter, where it builds the
 * record every path in the file is later derived from. Nothing outside this plugin sees the
 * change; `state.file.opts` is left alone, so error messages and source maps still carry the
 * real path.
 *
 * Forward slashes are what the extension wants anyway: it pastes the path into an editor URL
 * (vscode://file/D:/Astitwa/react/src/...), which takes them on Windows.
 */
function withPosixPaths(pluginFactory) {
  return (babel, ...rest) => {
    const plugin = pluginFactory(babel, ...rest)
    const program = plugin.visitor?.Program
    if (!program?.enter) return plugin

    return {
      ...plugin,
      visitor: {
        ...plugin.visitor,
        Program: {
          ...program,
          enter(path, state) {
            state.filename = toPosix(state.filename)
            state.cwd = toPosix(state.cwd)
            return program.enter.call(this, path, state)
          },
        },
      },
    }
  }
}
