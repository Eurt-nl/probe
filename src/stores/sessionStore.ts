import { defineStore } from 'pinia';
import { pb } from '@/services/pocketbase';

interface Credentials {
  email: string;
  password: string;
}

interface RegisterPayload extends Credentials {
  name: string;
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
    init(): void {
      this.user = pb.authStore.model as Record<string, unknown> | null;
      this.token = pb.authStore.token;

      pb.authStore.onChange((token, model) => {
        this.token = token;
        this.user = model as Record<string, unknown> | null;
      });
    },
    async login(payload: Credentials): Promise<void> {
      await pb.collection('users').authWithPassword(payload.email, payload.password);
      this.user = pb.authStore.model as Record<string, unknown> | null;
      this.token = pb.authStore.token;
    },
    async register(payload: RegisterPayload): Promise<void> {
      await pb.collection('users').create({
        email: payload.email,
        password: payload.password,
        passwordConfirm: payload.password,
        name: payload.name,
        display_name: payload.name
      });
      await this.login(payload);
    },
    logout(): void {
      pb.authStore.clear();
      this.user = null;
      this.token = '';
    }
  }
});
