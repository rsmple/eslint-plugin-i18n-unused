import {ESLint} from 'eslint'
import * as jsonParser from 'jsonc-eslint-parser'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {join} from 'node:path'
import * as vueParser from 'vue-eslint-parser'

import plugin from '../lib/index.js'

const FIXTURES = join(import.meta.dirname, 'fixtures')

// The two parser setups a consumer can arrive with: jsonc-eslint-parser configured directly, or
// @intlify/eslint-plugin-vue-i18n's, which wraps it in vue-eslint-parser. The rule must read both.
const DIRECT = {parser: jsonParser}
const WRAPPED = {parser: vueParser, parserOptions: {parser: jsonParser}}

const lint = (ruleOptions, code, {fix = false, languageOptions = DIRECT} = {}) => new ESLint({
  cwd: FIXTURES,
  overrideConfigFile: true,
  fix,
  overrideConfig: [
    {
      files: ['**/*.json'],
      languageOptions,
      plugins: {'i18n-unused': plugin},
      rules: {'i18n-unused/no-unused-keys': ['error', ruleOptions]},
    },
  ],
}).lintText(code, {filePath: join(FIXTURES, 'en.json')})

test('throws when src matches no files, rather than reporting everything unused', async () => {
  await assert.rejects(
    () => lint({src: './does-not-exist', extensions: ['.ts']}, '{"a": "1"}'),
    /No files matching '.\/does-not-exist' were found/,
  )
})

test('throws when extensions match no files in an existing directory', async () => {
  await assert.rejects(
    () => lint({src: './src', extensions: ['.svelte']}, '{"a": "1"}'),
    /No files matching/,
  )
})

test('a source tree with no translation calls reports every key', async () => {
  const [result] = await lint({src: './empty', extensions: ['.ts']}, '{"a": "1", "b": "2"}')

  assert.deepEqual(result.messages.map(m => m.message), [
    "unused 'a' key",
    "unused 'b' key",
  ])
})

test('removing every key with --fix leaves parseable JSON', async () => {
  const [result] = await lint(
    {src: './empty', extensions: ['.ts'], enableFix: true},
    '{\n  "a": "1",\n  "b": "2",\n  "c": {"d": "3"}\n}',
    {fix: true},
  )

  assert.doesNotThrow(() => JSON.parse(result.output))
  assert.deepEqual(JSON.parse(result.output), {c: {}})
})

test('reads @intlify\'s parser setup, where jsonc is wrapped in vue-eslint-parser', async () => {
  const options = {src: './src', extensions: ['.ts', '.vue']}
  const code = '{\n  "used": {"plain": "1"},\n  "dead": "2"\n}'

  const [wrapped] = await lint(options, code, {languageOptions: WRAPPED})

  assert.deepEqual(wrapped.messages.map(m => m.message), ["unused 'dead' key"])

  const [direct] = await lint(options, code)
  const positions = ({message, line, column, endLine, endColumn}) => ({message, line, column, endLine, endColumn})

  assert.deepEqual(wrapped.messages.map(positions), direct.messages.map(positions))
})

test('suggestions and --fix survive the wrapped parser, which supplies the tokens', async () => {
  const options = {src: './src', extensions: ['.ts', '.vue'], enableFix: true}
  const code = '{\n  "used": {"plain": "1"},\n  "dead": "2",\n  "alsoDead": "3"\n}'

  const [wrapped] = await lint(options, code, {fix: true, languageOptions: WRAPPED})
  const [direct] = await lint(options, code, {fix: true})

  assert.deepEqual(JSON.parse(wrapped.output), {used: {plain: '1'}})
  assert.equal(wrapped.output, direct.output)
})

test('a call inside a comment counts as usage, so --fix cannot delete the key', async () => {
  const code = '{"used": {"lineCommented": "1", "blockCommented": "2"}, "genuinely": {"dead": "3"}}'

  const [result] = await lint({src: './src', extensions: ['.ts']}, code)

  // Deliberate: a text scan cannot find comments cheaply, and guessing wrong deletes a live key.
  assert.deepEqual(result.messages.map(m => m.message), ["unused 'genuinely.dead' key"])
})

test('a file the parser does not report as JSON is skipped, not reported on', async () => {
  const code = '<i18n>\n{"en": {"blockKey": "hi", "deadBlockKey": "bye"}}\n</i18n>\n'

  const results = await new ESLint({
    cwd: FIXTURES,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.vue'],
        languageOptions: {parser: vueParser},
        plugins: {'i18n-unused': plugin},
        rules: {'i18n-unused/no-unused-keys': ['error', {src: './empty', extensions: ['.ts']}]},
      },
    ],
  }).lintText(code, {filePath: join(FIXTURES, 'sfc.vue')})

  // SFC <i18n> blocks are out of scope — the same guard that skips YAML locales.
  assert.deepEqual(results.flatMap(r => r.messages), [])
})

test('the plugin exposes the rule under its published name', () => {
  assert.ok(plugin.rules['no-unused-keys'])
  assert.equal(plugin.meta.name, 'eslint-plugin-i18n-unused')
})
