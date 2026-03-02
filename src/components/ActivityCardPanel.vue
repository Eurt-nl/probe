<template>
  <q-card flat bordered>
    <q-card-section class="row items-center justify-between">
      <div>
        <div class="text-h6">Activity Card</div>
        <div class="text-caption text-grey-8">{{ activeCard?.label ?? 'Nog geen kaart getrokken' }}</div>
      </div>
      <q-btn color="secondary" label="Trek kaart" @click="emit('draw')" />
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import type { ActivityCard } from '@/types/game';

defineProps<{
  activeCard: ActivityCard | null;
}>();

const emit = defineEmits<{
  draw: [];
}>();
</script>
