import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { withStepUp } from '@/lib/webauthn';
import type { Profile, ProfileGroup, Provider } from '@/lib/types';
import type { Tone } from '@/components/shared/ui';

export const PROFILES_KEY = ['profiles'] as const;

export function useProfiles(enabled = true) {
  return useQuery<Profile[]>({
    queryKey: PROFILES_KEY,
    enabled,
    queryFn: async () => (await api.get<Profile[]>('/v1/profiles')).data,
  });
}

export interface ProfileInput {
  title: string;
  provider: Provider;
  startUrl: string;
  group: ProfileGroup;
  colorToken: Tone;
  autoStart?: boolean;
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProfileInput) => (await api.post<Profile>('/v1/profiles', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Omit<ProfileInput, 'provider'>> & { id: string; pinned?: boolean }) => (await api.patch<Profile>(`/v1/profiles/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await withStepUp(() => api.delete(`/v1/profiles/${id}`));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}

export function useProfileAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'start' | 'suspend' | 'stop' }) => (await api.post(`/v1/profiles/${id}/${action}`)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: PROFILES_KEY }),
  });
}
