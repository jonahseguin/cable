'use client';

import {
  ApiKeyDisplay,
  DocumentationCard,
  NewApiKeyAlert,
  RegenerateButton,
  RegenerateDialog,
} from '@/components/dashboard/settings/api-keys';
import { useUserRole } from '@/hooks/use-user-role';
import { authClient } from '@[removed]/auth/client';
import { Card } from '@[removed]/ui/components/card';
import { Skeleton } from '@[removed]/ui/components/skeleton';
import { Key } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getOrganizationApiKey, regenerateApiKey } from './actions';

export default function ApiKeysPage() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { data: organization } = authClient.useActiveOrganization();
  const [showDialog, setShowDialog] = useState(false);
  const [apiKeyLast6, setApiKeyLast6] = useState<string | null>(null);
  const [apiKeyCreatedAt, setApiKeyCreatedAt] = useState<Date | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const isReady = !isLoading && !roleLoading;

  useEffect(() => {
    async function fetchApiKey() {
      if (!organization?.id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const key = await getOrganizationApiKey(organization.id);
        setApiKeyLast6(key?.apiKeyLast6 || null);
        setApiKeyCreatedAt(key?.apiKeyCreatedAt || null);
      } catch (err) {
        console.error('Failed to fetch API key:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchApiKey();
  }, [organization?.id]);

  async function handleRegenerateKey() {
    if (!organization?.id) return;

    try {
      setIsRegenerating(true);
      const result = await regenerateApiKey(organization.id);

      if (result) {
        setApiKeyLast6(result.key.slice(-6));
        setApiKeyCreatedAt(result?.apiKey?.createdAt || null);
        setNewApiKey(result.key);
        setShowDialog(false);
      }
    } catch (err) {
      console.error('Failed to regenerate API key:', err);
    } finally {
      setIsRegenerating(false);
    }
  }

  if (!isReady) {
    return (
      <Card>
        <div className="divide-border/60 flex flex-col divide-y">
          <div className="px-6 pb-5">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="mt-2 h-4 w-64" />
          </div>

          <div className="px-6 py-5">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <div>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-1 h-3 w-48" />
                </div>
              </div>
              <Skeleton className="h-8 w-24" />
            </div>

            <div className="space-y-3">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="mt-5 h-10 w-full" />
            </div>
          </div>

          <div className="flex items-center justify-between px-6 pt-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="mt-1 h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-8 w-40" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="divide-border/60 flex flex-col divide-y">
        <div className="px-6 pb-5">
          <h1 className="letter-spacing-[-0.01em] text-lg font-medium tracking-tight">API Keys</h1>
          <p className="text-muted-foreground/80 mt-1 max-w-prose text-sm">
            Manage the API keys for this team.
          </p>
        </div>

        {newApiKey && <NewApiKeyAlert apiKey={newApiKey} />}

        <div className="px-6 py-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-foreground/80 bg-secondary/40 flex h-8 w-8 items-center justify-center rounded-md">
                <Key className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <div>
                <h2 className="text-sm font-medium tracking-tight">API Key</h2>
                <p className="text-muted-foreground/80 mt-0.5 text-xs">
                  Use this key to authenticate requests to the [removed] API
                </p>
              </div>
            </div>

            <RegenerateButton
              isAdmin={isAdmin}
              apiKeyExists={!!apiKeyLast6}
              onRegenerateClick={() => setShowDialog(true)}
            />
          </div>

          <ApiKeyDisplay
            apiKeyLast6={apiKeyLast6}
            apiKeyCreatedAt={apiKeyCreatedAt}
            isAdmin={isAdmin}
            onRegenerateClick={() => setShowDialog(true)}
          />
        </div>

        <DocumentationCard />

        <RegenerateDialog
          open={showDialog}
          onOpenChange={setShowDialog}
          onConfirm={handleRegenerateKey}
          apiKeyExists={!!apiKeyLast6}
          isAdmin={isAdmin}
          isRegenerating={isRegenerating}
        />
      </div>
    </Card>
  );
}
