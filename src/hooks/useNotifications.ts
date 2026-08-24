import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  initNotificationSound,
  isNotificationSoundEnabled,
  playNotificationSound,
  playPaymentSound,
  setNotificationSoundEnabled,
  getPaymentSound,
  setPaymentSound,
  previewPaymentSound,
  type PaymentSoundId,
} from "@/lib/notificationSound";

const isPaymentType = (t?: string | null) => !!t && t.startsWith("payment");


export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  entity_id: string | null;
  created_at: string;
  isRead: boolean;
}

const LIMIT = 50;

export function useNotifications() {
  const { user, hasRole } = useAuth();
  const enabled = !!user && hasRole("admin");
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["notifications", user?.id],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<NotificationRow[]> => {
      const [{ data: notifs, error }, { data: reads, error: readsError }] = await Promise.all([
        supabase
          .from("notifications")
          .select("id, type, title, body, link_path, entity_id, created_at")
          .order("created_at", { ascending: false })
          .limit(LIMIT),
        supabase
          .from("notification_reads")
          .select("notification_id, dismissed")
          .eq("user_id", user!.id),
      ]);
      if (error) throw error;
      if (readsError) throw readsError;
      const readSet = new Set((reads ?? []).map((r) => r.notification_id));
      const dismissedSet = new Set((reads ?? []).filter((r) => r.dismissed).map((r) => r.notification_id));
      return (notifs ?? [])
        .filter((n) => !dismissedSet.has(n.id))
        .map((n) => ({ ...n, isRead: readSet.has(n.id) }));
    },
  });

  // Realtime: refresh + chime when a new notification is inserted
  const [soundEnabled, setSoundEnabledState] = useState(isNotificationSoundEnabled);
  const [paymentSound, setPaymentSoundState] = useState<PaymentSoundId>(getPaymentSound);

  useEffect(() => {
    initNotificationSound();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel("notifications-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const t = (payload.new as { type?: string } | null)?.type;
          if (isPaymentType(t)) playPaymentSound();
          else playNotificationSound();
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);


  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!user || ids.length === 0) return;
      const { error } = await supabase
        .from("notification_reads")
        .upsert(
          ids.map((notification_id) => ({ notification_id, user_id: user.id })),
          { onConflict: "notification_id,user_id", ignoreDuplicates: true }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const dismiss = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!user || ids.length === 0) return;
      const { error } = await supabase
        .from("notification_reads")
        .upsert(
          ids.map((notification_id) => ({ notification_id, user_id: user.id, dismissed: true })),
          { onConflict: "notification_id,user_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const items = query.data ?? [];
  const unreadCount = items.filter((n) => !n.isRead).length;

  // Fallback for when realtime is unavailable: chime when polling reveals a newer item.
  const latestId = items[0]?.id ?? null;
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);
  useEffect(() => {
    if (!latestId) return;
    if (lastSeenId === null) {
      setLastSeenId(latestId);
      return;
    }
    if (latestId !== lastSeenId) {
      setLastSeenId(latestId);
      if (isPaymentType(items[0]?.type)) playPaymentSound();
      else playNotificationSound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestId, lastSeenId]);

  return {
    items,
    unreadCount,
    isLoading: query.isLoading,
    enabled,
    soundEnabled,
    setSoundEnabled: (v: boolean) => {
      setNotificationSoundEnabled(v);
      setSoundEnabledState(v);
      if (v) playNotificationSound();
    },
    paymentSound,
    setPaymentSound: (id: PaymentSoundId) => {
      setPaymentSound(id);
      setPaymentSoundState(id);
      previewPaymentSound(id);
    },
    previewPaymentSound,

    markRead: (ids: string[]) => markRead.mutate(ids),
    markAllRead: () => markRead.mutate(items.filter((n) => !n.isRead).map((n) => n.id)),
    isMarking: markRead.isPending,
    dismiss: (ids: string[]) => dismiss.mutate(ids),
    clearAll: () => dismiss.mutate(items.map((n) => n.id)),
    isClearing: dismiss.isPending,
  };
}
