import {ESLint} from 'eslint'
import * as jsonParser from 'jsonc-eslint-parser'
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {join} from 'node:path'

import plugin from '../lib/index.js'

const FIXTURES = join(import.meta.dirname, 'fixtures')

const lint = (ruleOptions, code, {fix = false} = {}) => new ESLint({
  cwd: FIXTURES,
  overrideConfigFile: true,
  fix,
  overrideConfig: [
    {
      files: ['**/*.json'],
      languageOptions: {parser: jsonParser},
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

test('the plugin exposes the rule under its published name', () => {
  assert.ok(plugin.rules['no-unused-keys'])
  assert.equal(plugin.meta.name, 'eslint-plugin-i18n-unused')
})
