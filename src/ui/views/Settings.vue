<template>
  <div class="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>Jenkins 基础配置</CardTitle>
      </CardHeader>
      <CardContent>
        <JenkinsSettingsForm />
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import JenkinsSettingsForm from '@/components/settings/JenkinsSettingsForm.vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
</script>
