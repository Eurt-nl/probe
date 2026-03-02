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
const buildDate = __BUILD_DATE__;
</script>
