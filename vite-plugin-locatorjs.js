import { transformAsync } from '@babel/core'

const REGISTRY_OPEN = 'window.__LOCATOR_DATA__['
const ATTRIBUTE_OPEN = 'data-locatorjs-id={'

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
    name: 'hrsuite:locatorjs',
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
        plugins: [['@locator/babel-jsx/dist', { env: 'development' }]],
      })

      if (!result?.code) return null
      return { code: repairRegistryKey(result.code), map: result.map }
    },
  }
}

/**
 * Repairs the lookup key the Babel plugin writes, which is corrupt on Windows.
 *
 * The plugin emits its registry by building a line of SOURCE TEXT and re-parsing it, with
 * the filename dropped in unescaped:
 *
 *     window.__LOCATOR_DATA__["D:\Astitwa\react\src\...\Employee.jsx"] = { ... }
 *
 * On a POSIX path that is harmless. On a Windows path those are read as escape sequences and
 * eaten, so the key that comes out is not the key that went in — here it became
 * "D:Astitwa" followed by a mangled tail, while the attribute on the element still read the
 * real path. The extension looks the element up, misses, and reports "No source info found
 * for this element!" with everything apparently wired correctly. A path containing a
 * backslash followed by u or x is worse: it fails to parse at all and the file errors.
 *
 * Only the key is affected. filePath and projectPath inside the object are written as proper
 * escaped strings, and so is the attribute — that one is built as a syntax node rather than
 * as text. So the attribute is treated as the truth and the key is rewritten from it, which
 * makes the two agree by construction rather than by luck.
 *
 * Deliberately done by scanning rather than by regex: every pattern that could express this
 * needs escaped backslashes inside a character class, which is the same hazard that caused
 * the bug.
 */
function repairRegistryKey(code) {
  const registryAt = code.indexOf(REGISTRY_OPEN)
  if (registryAt === -1) return code

  const keyStart = registryAt + REGISTRY_OPEN.length
  const keyEnd = code.indexOf(']', keyStart)
  if (keyEnd === -1) return code

  const path = firstAttributePath(code)
  if (path === null) return code

  return code.slice(0, keyStart) + JSON.stringify(path) + code.slice(keyEnd)
}

/**
 * Reads the path out of the first data-locatorjs-id={"...::0"} in the file.
 * Returns null if there is none, or if it is not the shape expected.
 */
function firstAttributePath(code) {
  const at = code.indexOf(ATTRIBUTE_OPEN)
  if (at === -1) return null

  const literalStart = at + ATTRIBUTE_OPEN.length
  if (code[literalStart] !== '"') return null

  const literal = readStringLiteral(code, literalStart)
  if (literal === null) return null

  const cut = literal.lastIndexOf('::')
  return cut === -1 ? literal : literal.slice(0, cut)
}

/** Reads one double-quoted JS string literal starting at `start`, honouring escapes. */
function readStringLiteral(code, start) {
  let i = start + 1
  let out = ''

  while (i < code.length) {
    const ch = code[i]

    if (ch === '\\') {
      out += ch + code[i + 1]
      i += 2
      continue
    }
    if (ch === '"') {
      try {
        return JSON.parse('"' + out + '"')
      } catch {
        return null
      }
    }

    out += ch
    i += 1
  }

  return null
}
