# eslint-plugin-i18n-unused

Reports locale message keys that are never referenced from your source tree.

A drop-in replacement for [`@intlify/vue-i18n/no-unused-keys`][intlify-rule] with
the same options, message text, report positions, suggestions and autofix — but
it finds keys by scanning source text instead of building an AST for every file.

On a 1,264-file Vue + TypeScript project with 2,319 locale keys:

| | added to `eslint .` |
| --- | --- |
| `@intlify/vue-i18n/no-unused-keys` | **+18s** |
| `i18n-unused/no-unused-keys` | **+2s** |

Both report exactly the same keys. Re-linting the locale file after the first
scan costs ~17ms, so it stays usable in an editor.

> Not affiliated with the [`i18n-unused`][i18n-unused] CLI, which solves a
> similar problem outside of ESLint.

## Install

```sh
npm i -D eslint-plugin-i18n-unused
```

Requires ESLint 9+ and [`jsonc-eslint-parser`][jsonc] to parse the locale files.

## Usage

```js
// eslint.config.js
import i18nUnused from 'eslint-plugin-i18n-unused'
import * as jsonParser from 'jsonc-eslint-parser'

export default [
  {
    files: ['locales/en-US.json'],
    languageOptions: {parser: jsonParser},
    plugins: {'i18n-unused': i18nUnused},
    rules: {
      'i18n-unused/no-unused-keys': ['error', {
        src: './src',
        extensions: ['.ts', '.js', '.vue'],
      }],
    },
  },
]
```

**Point it at one locale file, not all of them.** The rule scans your source
tree once per file it lints, so matching three locales costs three scans for no
extra signal — key parity between locales is a different rule's job (see
[`no-missing-keys-in-other-locales`][parity]).

## Options

| Option | Type | Default | |
| --- | --- | --- | --- |
| `src` | `string \| string[]` | `process.cwd()` | Directory to scan for key usage. |
| `extensions` | `string[]` | `['.js', '.vue']` | File extensions to scan. |
| `ignores` | `string[]` | `[]` | Keys never to report. A plain string matches exactly; `/pattern/flags` is a regular expression. |
| `enableFix` | `boolean` | `false` | Let `--fix` delete unused keys. Suggestions are offered either way. |

`src` accepts an array as a superset of the upstream option, which takes a
string only.

### The `extensions` default will bite a TypeScript project

`['.js', '.vue']` is inherited from the upstream rule for migration parity, and
it does **not** include `.ts`. Leave it at the default in a TypeScript codebase
and every key referenced only from a `.ts` file is reported as unused — and with
`enableFix` enabled, deleted. Set it explicitly.

If `src` and `extensions` together match no files at all, the rule throws rather
than reporting your entire locale file as dead.

## Migrating from `@intlify/vue-i18n/no-unused-keys`

Swap the plugin and rename the rule. Nothing else moves — the options, message
text and report positions are identical, so existing `ignores` entries and
inline disable comments keep working.

```diff
-import vueI18n from '@intlify/eslint-plugin-vue-i18n'
+import i18nUnused from 'eslint-plugin-i18n-unused'
 import * as jsonParser from 'jsonc-eslint-parser'

 export default [
   {
     files: ['locales/en-US.json'],
     languageOptions: {parser: jsonParser},
-    plugins: {'@intlify/vue-i18n': vueI18n},
+    plugins: {'i18n-unused': i18nUnused},
     rules: {
-      '@intlify/vue-i18n/no-unused-keys': ['error', {
+      'i18n-unused/no-unused-keys': ['error', {
         src: './src',
         extensions: ['.ts', '.js', '.vue'],
         ignores: ['brand.legacy_name', '/^vendor\\./'],
         enableFix: false,
       }],
     },
   },
 ]
```

Two behavioural differences, both in this rule's favour:

- **Autofix converges in one run.** Deleting an unused key can orphan another
  key that it referenced via `@:link`. This rule notices within the same fix
  pass; the upstream rule caches its scan and needs a second process to settle.
- **Unparseable source files don't silently delete translations.** The upstream
  rule parses every source file and swallows parse errors, treating a file it
  can't read as containing zero keys — so a syntax error, an unconfigured
  parser, or an unsupported dialect turns live keys into "unused" ones. A text
  scan has no parse step to fail.

## What counts as usage

```js
$t('key')  t('key')  i18n.t('key')  tc('key')  tm('key')
<I18nT keypath="key" />   <i18n path="key" />
v-t="'key'"
"@:key"   "@.lower:key"   "@:{'key'}"     // linked messages, resolved in-file
```

Only static string literals are detected — the same limit the upstream rule has,
since it also reads literal arguments only. Pair this with a `no-dynamic-keys`
rule so computed keys can't slip past.

Matching is deliberately over-inclusive: a false "used" costs you a missed
report, while a false "unused" deletes a live translation. When a pattern is
ambiguous, it matches.

## Framework support

**vue-i18n / @intlify** is fully supported and is what this is validated
against.

Other ecosystems are **not** supported yet, and partial support would be worse
than none — every missed reference is a key reported as unused, and with
`enableFix` that means a deleted translation:

- **i18next** — plain `t('key')` and `i18next.t('key')` are picked up, but
  `<Trans i18nKey="key">` is not, and namespaced `t('ns:key')` keeps its `ns:`
  prefix rather than resolving against the namespace file.
- **react-intl / FormatJS** — neither `formatMessage({id})` nor
  `<FormattedMessage id>` is detected.

Adding these means contributing the call patterns *and* a real-world codebase to
validate against. Issues and PRs welcome.

## License

MIT © rsmple

[intlify-rule]: https://eslint-plugin-vue-i18n.intlify.dev/rules/no-unused-keys.html
[i18n-unused]: https://www.npmjs.com/package/i18n-unused
[jsonc]: https://www.npmjs.com/package/jsonc-eslint-parser
[parity]: https://eslint-plugin-vue-i18n.intlify.dev/rules/no-missing-keys-in-other-locales.html
