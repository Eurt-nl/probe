import { defineStore } from 'pinia';
import { collections, pb } from '@/services/pocketbase';

interface Credentials {
  email: string;
  password: string;
}

interface RegisterPayload extends Credentials {
  name: string;
}

interface ProfileUpdatePayload {
  name: string;
  avatarFile?: File | null;
  clearAvatar?: boolean;
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    user: pb.authStore.model as Record<string, unknown> | null,
    token: pb.authStore.token
  }),
  getters: {
    isAuthenticated(state): boolean {
      return Boolean(state.user && state.token);
    },
    userId(state): string {
      return String(state.user?.id ?? '');
    },
    displayName(state): string {
      return String(state.user?.display_name ?? state.user?.name ?? state.user?.email ?? '');
    }
  },
  actions: {
    normalizeEmail(email: string): string {
      return email.trim().toLowerCase();
    },
    init(): void {
      this.user = pb.authStore.model as Record<string, unknown> | null;
      this.token = pb.authStore.token;

      pb.authStore.onChange((token, model) => {
        this.token = token;
        this.user = model as Record<string, unknown> | null;
      });
    },
    async login(payload: Credentials): Promise<void> {
      await pb
        .collection(collections.users)
        .authWithPassword(this.normalizeEmail(payload.email), payload.password);
      this.user = pb.authStore.model as Record<string, unknown> | null;
      this.token = pb.authStore.token;
    },
    async register(payload: RegisterPayload): Promise<void> {
      const normalizedEmail = this.normalizeEmail(payload.email);
      await pb.collection(collections.users).create({
        email: normalizedEmail,
        password: payload.password,
        passwordConfirm: payload.password,
        name: payload.name,
        display_name: payload.name
      });
      await this.login({ email: normalizedEmail, password: payload.password });
    },
    logout(): void {
      pb.authStore.clear();
      this.user = null;
      this.token = '';
    },
    async updateProfile(payload: ProfileUpdatePayload): Promise<void> {
      if (!this.userId) {
        throw new Error('Niet ingelogd');
      }

      const body = new FormData();
      body.set('name', payload.name);
      body.set('display_name', payload.name);

      // PocketBase clears file fields when explicitly set to empty.
      if (payload.clearAvatar) {
        body.set('avatar', '');
      } else if (payload.avatarFile) {
        body.set('avatar', payload.avatarFile);
      }

      const updated = await pb.collection(collections.users).update(this.userId, body);
      this.user = updated as Record<string, unknown>;
      this.token = pb.authStore.token;
    }
  }
});
