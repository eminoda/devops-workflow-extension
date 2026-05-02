<template>
  <div class="h-full min-h-0 w-full overflow-hidden rounded-[12px] bg-background text-foreground flex flex-col">
    <header class="px-2.5 pt-2">
      <div class="flex items-center justify-between gap-2">
        <div class="text-sm font-semibold tracking-tight">Jenkins Runner</div>
        <div class="flex shrink-0 items-center gap-0.5">
          <input
            ref="importFileRef"
            type="file"
            accept="application/json,.json"
            class="sr-only"
            aria-hidden="true"
            @change="onImportFile"
          />
          <Button variant="ghost" size="icon" type="button" title="从 JSON 导入 Jobs 与设置" @click="openImportPicker">
            <FolderInput class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" type="button" title="导出 Jobs 与设置（JSON）" @click="onExportBackup">
            <FileJson class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" type="button" title="设置" @click="settingsOpen = true">
            <Settings class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs v-model="tab" class="mt-2 w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="run">运行监控</TabsTrigger>
          <TabsTrigger value="jobs">Jobs 管理</TabsTrigger>
        </TabsList>
      </Tabs>
    </header>

    <main class="flex-1 min-h-0 overflow-hidden px-2.5 py-2">
      <ScrollArea class="h-full pr-2">
        <RouterView />
      </ScrollArea>
    </main>

    <footer
      v-if="username"
      class="px-2.5 py-1.5 border-t border-border bg-background flex items-center text-xs text-muted-foreground"
    >
      <div class="truncate">用户：{{ username }}</div>
    </footer>

    <Sheet v-model:open="settingsOpen">
      <SheetContent side="bottom" class="max-h-[min(100vh,calc(85vh+30px))] overflow-y-auto rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Jenkins 配置</SheetTitle>
        </SheetHeader>
        <div class="mt-4">
          <JenkinsSettingsForm @saved="onSettingsSaved" />
        </div>
      </SheetContent>
    </Sheet>

    <ToastHost />
  </div>
</template>

<script setup lang="ts">
import { FileJson, FolderInput, Settings } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import JenkinsSettingsForm from '@/components/settings/JenkinsSettingsForm.vue'
import ToastHost from '@/components/ToastHost.vue'
import { exportBackupToFile, importBackupFromJsonString, loadSettings } from '@/lib/storage'
import { toast } from '@/ui/toast'
import type { JenkinsSettings } from '@/types'

const route = useRoute()
const router = useRouter()

const username = ref('')
const settingsOpen = ref(false)
const importFileRef = ref<HTMLInputElement | null>(null)

async function onExportBackup() {
  try {
    await exportBackupToFile()
    toast({ title: '已导出 JSON', variant: 'success' })
  } catch (e) {
    toast({ title: '导出失败', description: (e as Error).message, variant: 'error' })
  }
}

function openImportPicker() {
  importFileRef.value?.click()
}

async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!confirm('导入将覆盖本机的 Jobs 列表与 Jenkins 连接设置，是否继续？')) {
    input.value = ''
    return
  }
  try {
    const text = await file.text()
    await importBackupFromJsonString(text)
    const s = await loadSettings()
    username.value = s.jenkinsUser || ''
    toast({ title: '导入成功', variant: 'success' })
  } catch (e) {
    toast({ title: '导入失败', description: (e as Error).message, variant: 'error', timeoutMs: 4000 })
  } finally {
    input.value = ''
  }
}

const tab = computed<string>({
  get() {
    return route.path.startsWith('/jobs') ? 'jobs' : 'run'
  },
  set(v) {
    if (v === 'jobs') void router.push('/jobs')
    else void router.push('/')
  },
})

onMounted(async () => {
  const s = await loadSettings()
  username.value = s.jenkinsUser || ''
})

function onSettingsSaved(s: JenkinsSettings) {
  username.value = s.jenkinsUser || ''
}
</script>
