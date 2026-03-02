import { ref } from 'vue';
import { registerSW } from 'virtual:pwa-register';

const needRefresh = ref(false);

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    needRefresh.value = true;
  },
  onOfflineReady() {
    // App can work offline after first full load.
  }
});

export function useSwUpdate() {
  async function updateApp(): Promise<void> {
    if (!needRefresh.value) {
      window.location.reload();
      return;
    }
    await updateSW(true);
  }

  return {
    needRefresh,
    updateApp
  };
}
