import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PluginInviteRedeemError, PluginMutationResult } from 'frontend-plugin-types';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';

// Redeems an Invite link's token for the signed-in user (see ADR 0081, 0082). No toast: the plugin
// says what went wrong, as only it knows what the link was for.
export function useInviteRedeem(): PluginMutationResult<{ token: string }, void> {
  const queryClient = useQueryClient();
  const { request } = useRequest();
  const { mutateAsync, isPending, isError } = useMutation({
    mutationFn: async ({ token }: { token: string }) => {
      try {
        await request({ url: `${BACKEND_BASE_URL}/invites/redeem`, method: 'POST', body: { token }, showErrorNotification: false });
      } catch (error) {
        const { status, raw } = (error ?? {}) as { status?: number; raw?: unknown };
        throw { status: status ?? 0, body: raw } satisfies PluginInviteRedeemError;
      }
      // Resolves once the new grants are read: the plugin reads the config right after, and a read
      // cached from before the redemption (a 403) would hide what was granted.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entitlements'] }),
        queryClient.invalidateQueries({ queryKey: ['config-entitlements'] }),
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) => typeof queryKey[0] === 'string' && queryKey[0].startsWith('/configs'),
        }),
      ]);
    },
  });

  return useMemo(() => ({ mutateAsync, isPending, isError }), [mutateAsync, isPending, isError]);
}
