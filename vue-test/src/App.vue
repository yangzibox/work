<script setup>
import { ref } from 'vue'
const message = ref('这是我的第一个 Vue 变量')

setTimeout(()=>{message.value="fuck you"}, 2000)

</script>

<template>
  <h1>{{ message}}</h1>
</template>

<style scoped>
</style>
