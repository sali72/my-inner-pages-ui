import React, { useState, useEffect, useCallback } from 'react';
import { Laptop, Smartphone, Globe, Shield, Trash2, RefreshCw } from 'lucide-react';
import { authService, SessionResponse } from '@/services/authService';
import { ConfirmModal } from '@components/journal';

export const ActiveSessionsCard: React.FC = () => {
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingFamilyId, setRevokingFamilyId] = useState<string | null>(null);
  const [showRevokeOthersModal, setShowRevokeOthersModal] = useState(false);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await authService.getSessions();
      setSessions(res.sessions);
    } catch (err: any) {
      setError(err?.message || 'Failed to load active sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSingle = async (familyId: string) => {
    try {
      setRevokingFamilyId(familyId);
      await authService.revokeSession(familyId);
      setSessions((prev) => prev.filter((s) => s.family_id !== familyId));
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke session');
    } finally {
      setRevokingFamilyId(null);
    }
  };

  const handleConfirmRevokeOthers = async () => {
    try {
      setRevokingOthers(true);
      setShowRevokeOthersModal(false);
      await authService.revokeOtherSessions();
      setSessions((prev) => prev.filter((s) => s.is_current));
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke other sessions');
    } finally {
      setRevokingOthers(false);
    }
  };

  const getDeviceIcon = (os: string) => {
    const lower = os.toLowerCase();
    if (lower.includes('ios') || lower.includes('android')) {
      return <Smartphone className="w-5 h-5 text-accent" />;
    }
    if (lower.includes('mac') || lower.includes('windows') || lower.includes('linux')) {
      return <Laptop className="w-5 h-5 text-accent" />;
    }
    return <Globe className="w-5 h-5 text-accent" />;
  };

  const hasOtherSessions = sessions.some((s) => !s.is_current);

  return (
    <>
      <section className="bg-[var(--bg-elevated)] border border-subtle rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-secondary" />
            <h2 className="text-base font-semibold text-primary">Active Devices & Sessions</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchSessions}
              disabled={loading}
              title="Refresh session list"
              className="p-1.5 rounded-lg border border-default bg-surface text-secondary hover:text-primary hover:bg-surface-hover transition-all text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {hasOtherSessions && (
              <button
                onClick={() => setShowRevokeOthersModal(true)}
                disabled={revokingOthers}
                className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/5 transition-all text-xs font-medium"
              >
                Log out other devices
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-xs">
            {error}
          </div>
        )}

        {loading && sessions.length === 0 ? (
          <div className="py-6 text-center text-xs text-secondary animate-pulse">
            Loading active sessions...
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.family_id}
                className="flex items-center justify-between p-3.5 rounded-lg bg-surface border border-default transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-accent-tint flex items-center justify-center shrink-0">
                    {getDeviceIcon(session.os)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-primary truncate">
                        {session.device_name}
                      </span>
                      {session.is_current && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent text-white">
                          Current Device
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-secondary mt-0.5 truncate">
                      {session.ip_address ? `IP: ${session.ip_address} • ` : ''}
                      Last active: {new Date(session.last_used_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {!session.is_current && (
                  <button
                    onClick={() => handleRevokeSingle(session.family_id)}
                    disabled={revokingFamilyId === session.family_id}
                    title="Revoke session"
                    className="p-2 rounded-lg text-secondary hover:text-red-600 hover:bg-red-500/10 transition-all ml-2 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={showRevokeOthersModal}
        title="Log out of all other devices"
        message="This will immediately revoke access for all other active browser sessions and devices except this one. Do you want to proceed?"
        confirmLabel="Log out other devices"
        variant="danger"
        onConfirm={handleConfirmRevokeOthers}
        onCancel={() => setShowRevokeOthersModal(false)}
      />
    </>
  );
};
