import {RuleTester} from 'eslint'
import * as jsonParser from 'jsonc-eslint-parser'
import {describe, it} from 'node:test'
import {join} from 'node:path'

import rule from '../lib/rules/no-unused-keys.js'

globalThis.describe = describe
globalThis.it = it

const SRC_WITH_USAGE = join(import.meta.dirname, 'fixtures/src')
const SRC_WITHOUT_USAGE = join(import.meta.dirname, 'fixtures/empty')

const ruleOptions = (extra = {}) => [{
  src: SRC_WITH_USAGE,
  extensions: ['.ts', '.js', '.vue'],
  ...extra,
}]

const unused = (key, suggestions = 1) => ({messageId: 'unused', data: {key}, suggestions})

const ruleTester = new RuleTester({languageOptions: {parser: jsonParser}})

ruleTester.run('no-unused-keys', rule, {
  valid: [
    {
      name: 'every call shape counts as usage',
      filename: 'en.json',
      options: ruleOptions(),
      code: JSON.stringify({
        used: {
          dollar: 'a',
          component: 'b',
          directive: 'c',
          plain: 'd',
          member: 'e',
          fromTs: 'f',
          multiline: 'g',
          doubleQuoted: 'h',
          atFileStart: 'i',
        },
      }),
    },
    {
      name: 'a key reached only through a linked message on a used key is used',
      filename: 'en.json',
      options: ruleOptions(),
      code: JSON.stringify({used: {dollar: '@:linkTarget'}, linkTarget: 'target'}),
    },
    {
      name: 'linked message in braced form',
      filename: 'en.json',
      options: ruleOptions(),
      code: JSON.stringify({used: {dollar: "@:{'linkTarget'}"}, linkTarget: 'target'}),
    },
    {
      name: 'linked message with a modifier',
      filename: 'en.json',
      options: ruleOptions(),
      code: JSON.stringify({used: {dollar: '@.lower:linkTarget'}, linkTarget: 'target'}),
    },
    {
      name: 'ignores matches a plain key exactly',
      filename: 'en.json',
      options: ruleOptions({ignores: ['dead']}),
      code: JSON.stringify({dead: 'x'}),
    },
    {
      name: 'ignores accepts /pattern/ as a regular expression',
      filename: 'en.json',
      options: ruleOptions({ignores: ['/^dead\\./']}),
      code: JSON.stringify({dead: {one: '1', two: '2'}}),
    },
  ],

  invalid: [
    {
      name: 'reports an unused top-level key',
      filename: 'en.json',
      options: ruleOptions(),
      code: JSON.stringify({dead: 'x'}),
      errors: [unused('dead')],
    },
    {
      name: 'reports leaves, never their containing object',
      filename: 'en.json',
      options: ruleOptions(),
      code: JSON.stringify({dead: {one: '1', two: '2'}}),
      errors: [unused('dead.one', 2), unused('dead.two', 2)],
    },
    {
      name: 'array elements report with bracket syntax',
      filename: 'en.json',
      options: ruleOptions(),
      code: JSON.stringify({arr: ['x', 'y']}),
      errors: [unused('arr[0]', 2), unused('arr[1]', 2)],
    },
    {
      name: 'emit(), import() and split() are not translation calls',
      filename: 'en.json',
      options: ruleOptions(),
      code: JSON.stringify({decoy: {emit: 'a', import: 'b', split: 'c'}}),
      errors: [
        unused('decoy.emit', 2),
        unused('decoy.import', 2),
        unused('decoy.split', 2),
      ],
    },
    {
      name: 'an exact ignore does not leak onto neighbouring keys',
      filename: 'en.json',
      options: ruleOptions({ignores: ['modal.save']}),
      code: JSON.stringify({modal: {save: 'a', saved: 'b'}}),
      errors: [unused('modal.saved')],
    },
    {
      name: 'a key linked only from an unused key is still reported',
      filename: 'en.json',
      options: ruleOptions({src: SRC_WITHOUT_USAGE}),
      code: JSON.stringify({linkSource: '@:linkTarget', linkTarget: 'target'}),
      errors: [unused('linkSource')],
    },
    {
      name: 'enableFix removes the key and leaves valid JSON',
      filename: 'en.json',
      options: ruleOptions({enableFix: true}),
      code: '{\n  "used": {"dollar": "a"},\n  "dead": "x"\n}',
      output: '{\n  "used": {"dollar": "a"}\n}',
      errors: [unused('dead')],
    },
    {
      name: 'enableFix removes a leading key without stranding a comma',
      filename: 'en.json',
      options: ruleOptions({enableFix: true}),
      code: '{\n  "dead": "x",\n  "used": {"dollar": "a"}\n}',
      output: '{\n  "used": {"dollar": "a"}\n}',
      errors: [unused('dead')],
    },
    {
      name: 'offers a suggestion even when enableFix is off',
      filename: 'en.json',
      options: ruleOptions(),
      code: '{\n  "used": {"dollar": "a"},\n  "dead": "x"\n}',
      errors: [
        {
          messageId: 'unused',
          data: {key: 'dead'},
          suggestions: [
            {
              messageId: 'removeKey',
              data: {key: 'dead'},
              output: '{\n  "used": {"dollar": "a"}\n}',
            },
          ],
        },
      ],
    },
  ],
})
