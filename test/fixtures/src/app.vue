<template>
  <p>{{ $t('used.dollar') }}</p>
  <I18nT keypath="used.component" />
  <span v-t="'used.directive'" />
</template>

<script setup lang="ts">
const a = t('used.plain')
const b = i18n.t('used.member')

emit('decoy.emit')
import('./decoy-import')
'a b'.split('decoy.split')
</script>
