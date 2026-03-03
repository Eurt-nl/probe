<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-subtitle1">App Versiebeheer</div>
      <div class="text-caption text-grey-8">Huidige versie: {{ currentVersion }}</div>
      <div class="text-caption text-grey-8">Build datum: {{ buildDate }}</div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { appVersion } from '@/services/version';

const currentVersion = appVersion;

function formatBuildDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

const buildDate = formatBuildDate(__BUILD_DATE__);
</script>
