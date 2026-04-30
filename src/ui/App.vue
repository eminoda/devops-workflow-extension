<template>
  <div class="h-full min-h-0 w-full overflow-hidden rounded-[12px] bg-background text-foreground flex flex-col">
    <header class="px-2.5 pt-2">
      <div class="flex items-center justify-between">
        <div class="text-sm font-semibold tracking-tight">DevOps Workflow</div>
        <div class="text-xs text-muted-foreground">Jenkins</div>
      </div>

      <Tabs v-model="tab" class="mt-2 w-full">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="run">运行监控</TabsTrigger>
          <TabsTrigger value="jobs">Job 管理</TabsTrigger>
        </TabsList>
      </Tabs>
    </header>

    <main class="flex-1 min-h-0 overflow-hidden px-2.5 py-2">
      <ScrollArea class="h-full pr-2">
        <RouterView />
      </ScrollArea>
    </main>

    <footer class="px-2.5 py-1.5 border-t border-border bg-background flex items-center justify-between text-xs">
      <div class="text-muted-foreground truncate max-w-[60%]">
        {{ username ? `用户：${username}` : '未配置用户名' }}
      </div>
      <Button variant="ghost" size="icon" type="button" title="设置" @click="settingsOpen = true">
        <Settings class="h-4 w-4" />
      </Button>
    </footer>

    <Sheet v-model:open="settingsOpen">
      <SheetContent side="bottom" class="max-h-[85vh] overflow-y-auto rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Jenkins 连接</SheetTitle>
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
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Settings } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import JenkinsSettingsForm from '@/components/settings/JenkinsSettingsForm.vue'
import ToastHost from '@/components/ToastHost.vue'
import { loadSettings } from '@/lib/storage'
import type { JenkinsSettings } from '@/types'

const route = useRoute()
const router = useRouter()

const username = ref('')
const settingsOpen = ref(false)

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
