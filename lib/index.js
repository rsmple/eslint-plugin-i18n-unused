import noUnusedKeys from './rules/no-unused-keys.js'

const plugin = {
  meta: {
    name: 'eslint-plugin-i18n-unused',
    version: '0.1.0',
  },
  rules: {
    'no-unused-keys': noUnusedKeys,
  },
}

export default plugin
export const {meta, rules} = plugin
