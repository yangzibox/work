<script setup>
import { ref } from 'vue'

const items = ref(['苹果', '香蕉', '橘子'])
</script>

<template>
  <ul>
    <li v-for="(item, index) in items">
      {{ index + 1 }}. {{ item }}
    </li>
  </ul>
</template>

<style scoped>
</style>
