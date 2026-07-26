import {readFileSync, readdirSync, statSync} from 'node:fs'
import {extname, join, resolve} from 'node:path'

const TRANSLATE_CALL_RE = /(?:[$\s.:"'`+([{]t[cm]?)\(\s*?(["'`])((?:[^\\]|\\.)*?)\1/g
const TRANSLATE_COMPONENT_RE = /<(?:i18n|i18n-t|I18nT|Translation)\b[^>]*?\b(?:key)?path=(["'])((?:[^\\]|\\.)*?)\1/g
const TRANSLATE_DIRECTIVE_RE = /\bv-t(?:\.[\w-]+)?="'((?:[^\\]|\\.)*?)'"/g
const LINKED_MESSAGE_RE = /@(?:\.[a-z]+)?:(?:\{\s*'([^']+)'\s*\}|([\w-]+(?:\.[\w-]+)*))/g

const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.git'])

const REGEXP_CHAR_RE = /[\\^$.*+?()[\]{}|]/gu
const REGEXP_LITERAL_RE = /^\/(.+)\/(.*)$/u

const DEFAULT_EXTENSIONS = ['.js', '.vue']

const toRegExp = (pattern) => {
  const literal = REGEXP_LITERAL_RE.exec(pattern)

  if (literal) return new RegExp(literal[1], literal[2])

  return new RegExp(`^${ pattern.replace(REGEXP_CHAR_RE, '\\$&') }$`)
}

const joinKeyPath = (segments) => {
  let result = ''

  for (const segment of segments) {
    if (typeof segment === 'number') result += `[${ segment }]`
    else if (/^[^\s,.[\]]+$/u.test(segment)) result = result ? `${ result }.${ segment }` : segment
    else result += `[${ JSON.stringify(segment) }]`
  }

  return result
}

const listSourceFiles = (dir, extensions, found = []) => {
  let entries

  try {
    entries = readdirSync(dir, {withFileTypes: true})
  } catch (error) {
    return found
  }

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) listSourceFiles(path, extensions, found)
    } else if (extensions.includes(extname(entry.name))) {
      found.push(path)
    }
  }

  return found
}

const collectKeysFromText = (text, keys) => {
  for (const [,, key] of text.matchAll(TRANSLATE_CALL_RE)) keys.add(key)
  for (const [,, key] of text.matchAll(TRANSLATE_COMPONENT_RE)) keys.add(key)
  for (const [, key] of text.matchAll(TRANSLATE_DIRECTIVE_RE)) keys.add(key)
}

const collectLinkedKeys = (text, keys) => {
  for (const [, braced, plain] of text.matchAll(LINKED_MESSAGE_RE)) keys.add(braced ?? plain)
}

const keysByFile = new Map()

const collectKeysFromFile = (file) => {
  let mtimeMs

  try {
    mtimeMs = statSync(file).mtimeMs
  } catch (error) {
    return null
  }

  const cached = keysByFile.get(file)

  if (cached?.mtimeMs === mtimeMs) return cached.keys

  const keys = new Set()

  try {
    collectKeysFromText(readFileSync(file, 'utf8'), keys)
  } catch (error) {
    return null
  }

  keysByFile.set(file, {mtimeMs, keys})

  return keys
}

const collectUsedKeys = (cwd, src, extensions) => {
  const used = new Set()
  const roots = Array.isArray(src) ? src : [src]
  let fileCount = 0

  for (const root of roots) {
    const files = listSourceFiles(resolve(cwd, root), extensions)

    fileCount += files.length

    for (const file of files) {
      const keys = collectKeysFromFile(file)

      if (keys) for (const key of keys) used.add(key)
    }
  }

  if (fileCount === 0) throw new Error(`No files matching '${ roots.join('\', \'') }' were found.`)

  return used
}

const isContainer = (node) => node.type === 'JSONObjectExpression' || node.type === 'JSONArrayExpression'

export default {
  meta: {
    type: 'problem',
    docs: {description: 'disallow unused locale message keys'},
    fixable: 'code',
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          src: {oneOf: [{type: 'string'}, {type: 'array', items: {type: 'string'}}]},
          extensions: {type: 'array', items: {type: 'string'}},
          ignores: {type: 'array', items: {type: 'string'}},
          enableFix: {type: 'boolean'},
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unused: 'unused \'{{key}}\' key',
      removeKey: 'Remove the \'{{key}}\' key.',
      removeAll: 'Remove all unused keys.',
    },
  },

  create(context) {
    const {sourceCode} = context

    if (!sourceCode.parserServices?.isJSON) return {}

    const options = context.options[0] ?? {}
    const cwd = context.cwd ?? process.cwd()
    const ignores = (options.ignores ?? []).map(toRegExp)
    const enableFix = options.enableFix ?? false

    const used = collectUsedKeys(cwd, options.src ?? cwd, options.extensions ?? DEFAULT_EXTENSIONS)

    collectKeysFromText(sourceCode.getText(), used)
    collectLinkedKeys(sourceCode.getText(), used)

    const keyPath = []
    const unusedKeys = []

    const getRemovalRange = (node, alreadyRemoved) => {
      const container = node.parent
      const siblings = container.type === 'JSONObjectExpression'
        ? container.properties.filter(property => !alreadyRemoved.has(property))
        : container.elements.filter(element => element == null || !alreadyRemoved.has(element))
      const index = siblings.indexOf(node)
      const isEdge = index === 0 || index === siblings.length - 1

      alreadyRemoved.add(node)

      const range = [...node.range]

      if (isEdge) {
        const after = sourceCode.getTokenAfter(node)

        if (after?.type === 'Punctuator' && after.value === ',') range[1] = after.range[1]
      }

      const before = sourceCode.getTokenBefore(node)

      if (before) {
        if (before.type === 'Punctuator' && before.value === ',') range[0] = before.range[0]
        else range[0] = before.range[1]
      }

      return range
    }

    const removeKeyFix = (node) => (fixer) => fixer.removeRange(getRemovalRange(node, new Set()))

    const removeAllKeysFix = (nodes) => function *(fixer) {
      const alreadyRemoved = new Set()
      let previousEnd = 0

      for (const node of nodes) {
        const range = getRemovalRange(node, alreadyRemoved)

        yield fixer.removeRange([Math.max(previousEnd, range[0]), range[1]])
        previousEnd = range[1]
      }
    }

    const enterKey = (segment, node, reportNode, container) => {
      keyPath.push(segment)

      if (container) return

      const key = joinKeyPath(keyPath)

      if (!used.has(key)) unusedKeys.push({key, node, reportNode})
    }

    return {
      JSONProperty(node) {
        const segment = node.key.type === 'JSONLiteral' ? String(node.key.value) : node.key.name

        enterKey(segment, node, node.key, isContainer(node.value))
      },
      'JSONProperty:exit'() {
        keyPath.pop()
      },
      'JSONArrayExpression > *'(node) {
        enterKey(node.parent.elements.indexOf(node), node, node, isContainer(node))
      },
      'JSONArrayExpression > *:exit'() {
        keyPath.pop()
      },
      'Program:exit'() {
        const reported = unusedKeys.filter(({key}) => !ignores.some(pattern => pattern.test(key)))

        for (const {key, node, reportNode} of reported) {
          const fix = removeKeyFix(node)

          context.report({
            node: reportNode,
            messageId: 'unused',
            data: {key},
            fix: enableFix ? fix : null,
            suggest: [
              {messageId: 'removeKey', data: {key}, fix},
              reported.length > 1
                ? {messageId: 'removeAll', fix: removeAllKeysFix(reported.map(unused => unused.node))}
                : null,
            ].filter(Boolean),
          })
        }
      },
    }
  },
}
