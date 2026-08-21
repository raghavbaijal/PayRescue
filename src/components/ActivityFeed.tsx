import React, { useEffect, useState } from 'react';
import type { AuditLog } from '../types';
import { fetchRecentActivityFeed } from '../services/auditService';
import { formatDate } from '../utils/formatters';
import { Activity, Bot, CheckCircle2, AlertTriangle, RefreshCw, Zap } from 'lucide-react';

interface ActivityFeedProps {
  refreshTrigger?: number;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ refreshTrigger }) => {
  const [activities, setActivities] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadFeed = async () => {
    setLoading(true);
    const logs = await fetchRecentActivityFeed(10);
    setActivities(logs);
    setLoading(false);
  };

  useEffect(() => {
    loadFeed();
  }, [refreshTrigger]);

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-orange-500" />
          <h3 className="text-xs font-bold text-slate-100 font-mono uppercase tracking-wider">
            Live Recovery Activity Feed
          </h3>
        </div>
        <button
          onClick={loadFeed}
          className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
          title="Refresh Feed"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
        </button>
      </div>

      <div className="space-y-3 font-mono text-xs overflow-y-auto max-h-80 pr-1 flex-1">
        {loading && activities.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <RefreshCw className="w-4 h-4 animate-spin text-orange-500 mx-auto mb-2" />
            <span>Polling audit trail events...</span>
          </div>
        ) : activities.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            No recovery events recorded in audit log yet.
          </div>
        ) : (
          activities.map(log => {
            const isAI = log.actor === 'ai_agent';
            const isSuccess = log.action_taken === 'recovered' || log.event_type === 'recovery_successful';
            const isEscalated = log.action_taken === 'escalated' || log.event_type === 'escalated';

            return (
              <div key={log.id} className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <div className="flex items-center space-x-1.5">
                    {isSuccess ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : isEscalated ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    ) : isAI ? (
                      <Bot className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${isAI ? 'bg-orange-950 text-orange-400 border border-orange-800' : 'bg-slate-800 text-slate-300'}`}>
                      {log.actor}
                    </span>
                    <span className="font-bold text-slate-200 uppercase">{log.event_type}</span>
                  </div>
                  <span className="text-slate-500">{formatDate(log.created_at)}</span>
                </div>

                <p className="text-slate-300 font-sans text-xs line-clamp-2 pl-5">
                  {log.decision_reason}
                </p>

                {log.ai_confidence !== null && (
                  <div className="pl-5 pt-0.5 flex items-center space-x-2 text-[10px] text-slate-400">
                    <span>AI Confidence:</span>
                    <span className="text-emerald-400 font-bold">{(log.ai_confidence * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
