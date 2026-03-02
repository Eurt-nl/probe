<template>
  <q-banner v-if="latestVersion && latestVersion !== currentVersion" class="bg-amber-2 text-dark q-mb-md rounded-borders">
    <template #avatar>
      <q-icon name="system_update" />
    </template>
    Nieuwe appversie beschikbaar: {{ latestVersion }} (huidig: {{ currentVersion }})
    <template #action>
      <q-btn color="primary" label="Update nu" unelevated @click="onUpdate" />
    </template>
  </q-banner>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchLatestVersion, appVersion } from '@/services/version';

const props = defineProps<{
  onUpdate: () => void;
}>();

const currentVersion = appVersion;
const latestVersion = ref<string | null>(null);

onMounted(async () => {
  const version = await fetchLatestVersion();
  latestVersion.value = version?.version ?? null;
});
</script>
