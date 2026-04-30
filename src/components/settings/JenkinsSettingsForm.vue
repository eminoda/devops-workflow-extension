<template>
  <form class="space-y-4" @submit.prevent="save">
    <div class="space-y-2">
      <Label for="jenkins-url">Jenkins 地址</Label>
      <Input
        id="jenkins-url"
        v-model="form.jenkinsUrl"
        type="url"
        placeholder="https://jenkins.example.com"
        required
      />
    </div>
    <div class="space-y-2">
      <Label for="jenkins-user">用户名</Label>
      <Input id="jenkins-user" v-model="form.jenkinsUser" type="text" placeholder="Jenkins 登录名" required />
    </div>
    <div class="space-y-2">
      <Label for="jenkins-token">API Token</Label>
      <Input
        id="jenkins-token"
        v-model="form.jenkinsToken"
        class="font-mono"
        type="password"
        autocomplete="off"
        required
      />
    </div>
    <Separator />
    <div class="space-y-2">
      <Label for="wecom-global">企微 Webhook（全局，可选）</Label>
      <Input
        id="wecom-global"
        v-model="form.wecomWebhookGlobal"
        type="url"
        placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
      />
    </div>
    <div class="space-y-2">
      <Button class="w-full" type="submit" :disabled="saving">保存</Button>
      <div class="flex flex-col gap-1">
        <span v-if="savedAt" class="text-xs text-muted-foreground">已保存（{{ savedAt }}）</span>
        <span v-if="err" class="text-xs text-destructive">{{ err }}</span>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { loadSettings, saveSettings } from '@/lib/storage'
import type { JenkinsSettings } from '@/types'
import { defaultSettings } from '@/types'

const emit = defineEmits<{
  saved: [JenkinsSettings]
}>()

const form = reactive<JenkinsSettings>({ ...defaultSettings() })
const saving = ref(false)
const savedAt = ref('')
const err = ref('')

onMounted(async () => {
  Object.assign(form, await loadSettings())
})

async function save() {
  err.value = ''
  saving.value = true
  try {
    const next = { ...form }
    await saveSettings(next)
    const d = new Date()
    savedAt.value = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    emit('saved', next)
  } catch (e) {
    err.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>
