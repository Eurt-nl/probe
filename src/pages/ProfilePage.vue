<template>
  <q-page class="page-wrap">
    <div class="container q-pa-md">
      <q-card flat bordered>
        <q-card-section class="row items-center justify-between">
          <div>
            <div class="text-h6">Profiel</div>
            <div class="text-caption text-grey-7">Werk je naam en avatar bij.</div>
          </div>
          <q-btn flat color="primary" icon="arrow_back" label="Terug" @click="router.push({ name: 'home' })" />
        </q-card-section>

        <q-separator />

        <q-card-section>
          <div class="row q-col-gutter-md">
            <div class="col-12 col-md-7">
              <q-input v-model="name" label="Naam" maxlength="24" />
              <q-file
                v-model="avatarFile"
                class="q-mt-md"
                label="Avatar"
                accept="image/*"
                clearable
                max-files="1"
              />
              <div class="row q-gutter-sm q-mt-md">
                <q-btn color="primary" label="Opslaan" :loading="saving" @click="onSave" />
                <q-btn outline color="negative" label="Verwijder avatar" :disable="!hasAvatar" @click="onClearAvatar" />
              </div>
            </div>
            <div class="col-12 col-md-5">
              <div class="text-caption q-mb-xs">Preview</div>
              <div class="profile-avatar-preview">
                <img v-if="previewUrl" :src="previewUrl" alt="Avatar preview" class="profile-avatar-image" />
                <span v-else>{{ initials }}</span>
              </div>
            </div>
          </div>
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionStore } from '@/stores/sessionStore';
import { pb } from '@/services/pocketbase';

const router = useRouter();
const $q = useQuasar();
const session = useSessionStore();

if (!session.isAuthenticated || !session.userId) {
  void router.replace({ name: 'home' });
}

const name = ref(String(session.user?.display_name ?? session.user?.name ?? ''));
const avatarFile = ref<File | null>(null);
const saving = ref(false);
const clearAvatarRequested = ref(false);
const objectPreviewUrl = ref('');

const currentAvatarFilename = computed(() => String(session.user?.avatar ?? ''));
const hasAvatar = computed(() => Boolean(currentAvatarFilename.value));

const currentAvatarUrl = computed(() => {
  if (!hasAvatar.value || !session.user) return '';
  return pb.files.getURL(session.user as Record<string, unknown>, currentAvatarFilename.value);
});

const previewUrl = computed(() => {
  if (objectPreviewUrl.value) return objectPreviewUrl.value;
  if (clearAvatarRequested.value) return '';
  return currentAvatarUrl.value;
});

const initials = computed(() => (name.value.trim().charAt(0).toUpperCase() || '?'));

function errorMessage(error: unknown): string {
  const anyError = error as {
    response?: { message?: string; data?: Record<string, unknown> };
    message?: string;
  };
  const details = anyError?.response?.data ? ` ${JSON.stringify(anyError.response.data)}` : '';
  return `${anyError?.response?.message ?? anyError?.message ?? String(error)}${details}`;
}

function onClearAvatar(): void {
  clearAvatarRequested.value = true;
  avatarFile.value = null;
}

async function onSave(): Promise<void> {
  const trimmedName = name.value.trim();
  if (trimmedName.length < 2) {
    $q.notify({ type: 'warning', message: 'Naam moet minimaal 2 tekens zijn' });
    return;
  }

  saving.value = true;
  try {
    const processedAvatar = avatarFile.value ? await buildSquareAvatarThumbnail(avatarFile.value) : null;
    await session.updateProfile({
      name: trimmedName,
      avatarFile: processedAvatar,
      clearAvatar: clearAvatarRequested.value
    });
    clearAvatarRequested.value = false;
    avatarFile.value = null;
    $q.notify({ type: 'positive', message: 'Profiel bijgewerkt' });
  } catch (error) {
    $q.notify({ type: 'negative', message: `Opslaan mislukt: ${errorMessage(error)}` });
  } finally {
    saving.value = false;
  }
}

onBeforeUnmount(() => {
  if (objectPreviewUrl.value) {
    URL.revokeObjectURL(objectPreviewUrl.value);
  }
});

watch(avatarFile, (file) => {
  if (objectPreviewUrl.value) {
    URL.revokeObjectURL(objectPreviewUrl.value);
    objectPreviewUrl.value = '';
  }
  if (file) {
    objectPreviewUrl.value = URL.createObjectURL(file);
    clearAvatarRequested.value = false;
  }
});

async function buildSquareAvatarThumbnail(file: File): Promise<File> {
  const image = await loadImageFile(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    return file;
  }

  const size = Math.min(sourceWidth, sourceHeight);
  const sx = Math.floor((sourceWidth - size) / 2);
  const sy = Math.floor((sourceHeight - size) / 2);
  const targetSize = 256;

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, sx, sy, size, size, 0, 0, targetSize, targetSize);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), 'image/webp', 0.9);
  });
  if (!blob) return file;

  return new File([blob], `avatar-${Date.now()}.webp`, {
    type: 'image/webp',
    lastModified: Date.now()
  });
}

async function loadImageFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve(img);
      };
      img.onerror = () => {
        reject(new Error('Afbeelding laden mislukt'));
      };
      img.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
</script>

<style scoped>
.profile-avatar-preview {
  width: 120px;
  height: 120px;
  border-radius: 16px;
  border: 1px solid #d5d5d5;
  background: #f2f2f2;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44px;
  font-weight: 700;
  color: #444;
  overflow: hidden;
}

.profile-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
