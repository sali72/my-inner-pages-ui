import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { JournalEntry } from '@/types';
import { api } from '@utils/api';
import { journalListResponseSchema, journalResponseSchema } from '@/types/schemas';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';
import { syncUnsyncedEntries as syncService } from '@/services/syncService';
import type { z } from 'zod';

const QUERY_KEY = ['journals'] as const;
const PAGE_SIZE = 20;

function mapEntry(item: z.infer<typeof journalResponseSchema>): JournalEntry {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    tags: item.tags,
    date: new Date(item.created_at).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }),
    created_at: item.created_at,
  };
}

export const useJournalEntries = () => {
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const query = useInfiniteQuery({
    queryKey: QUERY_KEY,
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/journals?page_size=${PAGE_SIZE}&cursor=${encodeURIComponent(pageParam)}`
        : `/journals?page_size=${PAGE_SIZE}`;
      const response = await api.get(url, journalListResponseSchema);
      return response;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: isAuthenticated && !authLoading,
    staleTime: 30_000,
  });

  const entries: JournalEntry[] = (query.data?.pages ?? [])
    .flatMap(page => page.items.map(mapEntry));

  const createMutation = useMutation({
    mutationFn: (entry: Omit<JournalEntry, 'id'>) =>
      api.post('/journals', { title: entry.title, content: entry.content, tags: entry.tags, created_at: entry.created_at }, journalResponseSchema),
    onMutate: async (_newEntry) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previousData = queryClient.getQueryData<typeof query.data>(QUERY_KEY);
      return { previousData };
    },
    onError: (_err, _newEntry, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(QUERY_KEY, context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }).catch(() => {});
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, title, content, tags, created_at }: Partial<JournalEntry> & { id: number | string }) =>
      api.put(`/journals/${id}`, { title, content, tags, created_at }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }).catch(() => {});
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number | string) => api.delete(`/journals/${id}`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }).catch(() => {});
    },
  });

  const addEntry = async (entry: Omit<JournalEntry, 'id'>) => {
    const created = await createMutation.mutateAsync(entry);
    return mapEntry(created);
  };

  const updateEntry = async (id: number | string, updates: Partial<JournalEntry>) => {
    await updateMutation.mutateAsync({ id, ...updates });
  };

  const deleteEntry = async (id: number | string) => {
    await deleteMutation.mutateAsync(id);
  };

  const syncUnsyncedEntries = useCallback(async (onIdMigrate?: (oldId: string | number, newId: string | number) => void) => {
    await syncService(onIdMigrate, () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }).catch(() => {});
    });
  }, [queryClient]);

  return {
    entries,
    loading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    addEntry,
    updateEntry,
    deleteEntry,
    syncUnsyncedEntries,
    refreshEntries: () => { queryClient.invalidateQueries({ queryKey: QUERY_KEY }).catch(() => {}); },
  };
};
