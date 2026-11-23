import { useCallback, useMemo } from 'react';
import type { PluginConfigInvite, PluginConfigInviteInput, PluginMutationResult } from 'frontend-plugin-types';
import type { InviteCreateBody, InviteCreated } from 'types/backend';
import { useApiMutation } from './useApiMutation';
import { buildPluginConfigId } from './pluginConfigId';

// An Invite to one of the plugin's own config items (see ADR 0082). The host builds the
// plugin:{pluginId}:{id} key itself, so a plugin can't hold back grants on another plugin's items.
export function usePluginConfigInviteCreate(
  pluginId: string,
  configId: string,
): PluginMutationResult<PluginConfigInviteInput, PluginConfigInvite> {
  const {
    mutateAsync: createInvite,
    isPending,
    isError,
  } = useApiMutation<InviteCreated, InviteCreateBody>({
    endpoint: '/invites',
    method: 'POST',
  });

  const mutateAsync = useCallback(
    async ({ capabilities, recipient, reusable, expiresInDays }: PluginConfigInviteInput): Promise<PluginConfigInvite> => {
      const invite = await createInvite({
        grants: { configs: { [buildPluginConfigId(pluginId, configId)]: capabilities } },
        ...(recipient !== undefined && { recipient }),
        ...(reusable !== undefined && { reusable }),
        ...(expiresInDays !== undefined && { expires_in_days: expiresInDays }),
      });
      return { id: invite.id, token: invite.token, expiresAt: invite.expires_at };
    },
    [createInvite, pluginId, configId],
  );

  return useMemo(() => ({ mutateAsync, isPending, isError }), [mutateAsync, isPending, isError]);
}
