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
      <div
        v-if="userSecurityHelpUrl"
        class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
      >
        <span>不知道如何设置？</span>
        <a
          :href="userSecurityHelpUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center justify-center rounded-md p-0.5 text-primary hover:bg-muted/70 hover:text-primary"
          title="在浏览器中打开 Jenkins 用户安全设置"
        >
          <ExternalLink class="h-4 w-4 shrink-0" aria-hidden="true" />
          <span class="sr-only">跳转至 Jenkins 用户安全设置</span>
        </a>
      </div>
    </div>
    <Separator />
    <div class="space-y-2">
      <Label for="wecom-global">企微 Webhook</Label>
      <Input
        id="wecom-global"
        v-model="form.wecomWebhookGlobal"
        type="url"
        placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
      />
    </div>
    <div class="space-y-2">
      <Button class="w-full" type="submit" :disabled="saving">保存</Button>
      <p class="text-center text-[11px] leading-snug text-muted-foreground">
        所有配置&记录均在本地，不会上传至服务端
      </p>
      <div class="flex flex-col gap-1">
        <span v-if="savedAt" class="text-xs text-muted-foreground">已保存（{{ savedAt }}）</span>
        <span v-if="err" class="text-xs text-destructive">{{ err }}</span>
      </div>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { joinUrl } from '@/lib/jenkins-utils'
import { loadSettings, saveSettings, STORAGE_RELOAD_EVENT } from '@/lib/storage'
import type { JenkinsSettings } from '@/types'
import { defaultSettings } from '@/types'

const emit = defineEmits<{
  saved: [JenkinsSettings]
  'save-failed': [message: string]
}>()

const form = reactive<JenkinsSettings>({ ...defaultSettings() })
/** Jenkins 用户 API Token 说明页：{base}/user/{username}/security */
const userSecurityHelpUrl = computed(() => {
  const base = form.jenkinsUrl?.trim()
  const user = form.jenkinsUser?.trim()
  if (!base || !user) return ''
  return joinUrl(base, `user/${encodeURIComponent(user)}/security`)
})
const saving = ref(false)
const savedAt = ref('')
const err = ref('')

async function hydrateFormFromStorage() {
  Object.assign(form, await loadSettings())
}

function onStorageReloadFromImport() {
  void hydrateFormFromStorage()
}

onMounted(async () => {
  await hydrateFormFromStorage()
  window.addEventListener(STORAGE_RELOAD_EVENT, onStorageReloadFromImport)
})

onUnmounted(() => {
  window.removeEventListener(STORAGE_RELOAD_EVENT, onStorageReloadFromImport)
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
    const msg = (e as Error).message
    err.value = msg
    emit('save-failed', msg)
  } finally {
    saving.value = false
  }
}
</script>
