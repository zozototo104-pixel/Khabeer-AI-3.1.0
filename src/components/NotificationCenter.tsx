import { useState, useEffect, useRef } from 'react';
import { 
  Bell, AlertTriangle, Clock, Target, CheckCircle2, 
  Calendar, ChevronLeft, Check, Trash2, X, AlertOctagon,
  Sparkles, ExternalLink
} from 'lucide-react';

export interface NotificationItem {
  id: string;
  type: 'risk' | 'task' | 'decision' | 'meeting';
  title: string;
  description: string;
  severity?: 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: string;
  isRead: boolean;
  actionPayload?: any;
  dueDate?: string;
}

interface NotificationCenterProps {
  tasks: any[];
  risks: any[];
  decisions: any[];
  meetings?: any[];
  onCompleteTask?: (taskId: number) => void;
  onNavigateToTab?: (tab: string) => void;
}

export default function NotificationCenter({
  tasks,
  risks,
  decisions,
  meetings = [],
  onCompleteTask,
  onNavigateToTab
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'RISKS' | 'TASKS' | 'MEETINGS'>('ALL');
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('smart_advisor_read_notifs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Generate dynamic smart notification items from live tasks, risks, decisions
  const notifications: NotificationItem[] = [];

  // 1. Critical Risks
  risks.forEach(r => {
    notifications.push({
      id: `risk-${r.id}`,
      type: 'risk',
      title: `خطر مرصود: ${r.title}`,
      description: r.description || 'يتطلب خطة تحوط عاجلة ومعالجة من الإدارة المعنية.',
      severity: r.severity || 'HIGH',
      createdAt: r.createdAt || new Date().toISOString(),
      isRead: readIds.includes(`risk-${r.id}`)
    });
  });

  // 2. Pending Tasks
  tasks.filter(t => t.status !== 'COMPLETED').forEach(t => {
    notifications.push({
      id: `task-${t.id}`,
      type: 'task',
      title: `مهمة قيد المتابعة: ${t.title}`,
      description: `المسؤول: ${t.assignee || 'غير محدد'} | الحالة: قيد التنفيذ`,
      createdAt: t.createdAt || new Date().toISOString(),
      isRead: readIds.includes(`task-${t.id}`),
      actionPayload: { taskId: t.id }
    });
  });

  // 3. Strategic Decisions (Approved)
  decisions.slice(0, 3).forEach(d => {
    notifications.push({
      id: `decision-${d.id}`,
      type: 'decision',
      title: `قرار معتمد: ${d.title}`,
      description: d.description || 'تم اعتماد القرار الاستراتيجي في جلسة المجلس.',
      createdAt: d.createdAt || new Date().toISOString(),
      isRead: readIds.includes(`decision-${d.id}`)
    });
  });

  // 4. Upcoming Meetings
  meetings.slice(0, 2).forEach(m => {
    notifications.push({
      id: `meeting-${m.id}`,
      type: 'meeting',
      title: `اجتماع مجدول: ${m.title || `جلسة رقم ${m.id}`}`,
      description: `تاريخ الانعقاد: ${new Date(m.createdAt || Date.now()).toLocaleDateString('ar-SA')}`,
      createdAt: m.createdAt || new Date().toISOString(),
      isRead: readIds.includes(`meeting-${m.id}`)
    });
  });

  // Sort by unread first, then by date
  notifications.sort((a, b) => {
    if (a.isRead === b.isRead) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return a.isRead ? 1 : -1;
  });

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === 'RISKS') return n.type === 'risk';
    if (activeFilter === 'TASKS') return n.type === 'task';
    if (activeFilter === 'MEETINGS') return n.type === 'meeting' || n.type === 'decision';
    return true;
  });

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const markAllAsRead = () => {
    const allIds = notifications.map(n => n.id);
    setReadIds(allIds);
    localStorage.setItem('smart_advisor_read_notifs', JSON.stringify(allIds));
  };

  const markItemAsRead = (id: string) => {
    if (!readIds.includes(id)) {
      const updated = [...readIds, id];
      setReadIds(updated);
      localStorage.setItem('smart_advisor_read_notifs', JSON.stringify(updated));
    }
  };

  return (
    <div className="relative" ref={dropdownRef} dir="rtl">
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
        title="التنبيهات والإشعارات"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-3 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="p-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  مركز التنبيهات والإشعارات
                  {unreadCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                      {unreadCount} جديد
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">تذكير بالمخاطر الحرجة والمهام المعلقة</p>
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-blue-500/10 px-2 py-1 rounded-lg transition-colors"
              >
                <Check className="w-3 h-3" />
                تحديد الكل كمقروء
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex p-1.5 bg-slate-950/80 border-b border-slate-800 gap-1 text-xs">
            <button
              onClick={() => setActiveFilter('ALL')}
              className={`flex-1 py-1 px-2 rounded-lg font-medium transition-all ${
                activeFilter === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              الكل ({notifications.length})
            </button>
            <button
              onClick={() => setActiveFilter('RISKS')}
              className={`flex-1 py-1 px-2 rounded-lg font-medium transition-all ${
                activeFilter === 'RISKS' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              مخاطر ({risks.length})
            </button>
            <button
              onClick={() => setActiveFilter('TASKS')}
              className={`flex-1 py-1 px-2 rounded-lg font-medium transition-all ${
                activeFilter === 'TASKS' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              مهام ({tasks.filter(t => t.status !== 'COMPLETED').length})
            </button>
          </div>

          {/* Notification Items List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-800/80">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-2">
                <CheckCircle2 className="w-10 h-10 mx-auto text-green-500/40" />
                <p className="text-xs font-medium text-slate-400">لا توجد تنبيهات جديدة حالياً.</p>
                <p className="text-[11px] text-slate-600">كافة المهام والمخاطر تحت السيطرة والمتابعة.</p>
              </div>
            ) : (
              filteredNotifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => markItemAsRead(item.id)}
                  className={`p-3.5 transition-colors cursor-pointer hover:bg-slate-800/60 ${
                    item.isRead ? 'bg-slate-900/40 opacity-75' : 'bg-slate-800/30 border-r-2 border-blue-500'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    
                    {/* Icon */}
                    <div className="flex-none mt-0.5">
                      {item.type === 'risk' && (
                        <div className="p-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl">
                          <AlertOctagon className="w-4 h-4" />
                        </div>
                      )}
                      {item.type === 'task' && (
                        <div className="p-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl">
                          <Clock className="w-4 h-4" />
                        </div>
                      )}
                      {item.type === 'decision' && (
                        <div className="p-2 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl">
                          <Target className="w-4 h-4" />
                        </div>
                      )}
                      {item.type === 'meeting' && (
                        <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
                          <Calendar className="w-4 h-4" />
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="text-xs font-bold text-white truncate">{item.title}</h4>
                        {!item.isRead && (
                          <span className="w-2 h-2 rounded-full bg-blue-500 flex-none" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-2">
                        {item.description}
                      </p>

                      {/* Action buttons if available */}
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{new Date(item.createdAt).toLocaleDateString('ar-SA')}</span>

                        {item.type === 'task' && (
                          <div className="flex items-center gap-1.5">
                            {onNavigateToTab && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigateToTab('ai_tasks');
                                  setIsOpen(false);
                                }}
                                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium"
                              >
                                عرض في مهام الذكاء <ChevronLeft className="w-3 h-3" />
                              </button>
                            )}
                            {onCompleteTask && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCompleteTask(item.actionPayload.taskId);
                                  markItemAsRead(item.id);
                                }}
                                className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-md transition-colors"
                              >
                                <Check className="w-3 h-3" /> تم الإنجاز
                              </button>
                            )}
                          </div>
                        )}

                        {item.type === 'risk' && onNavigateToTab && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateToTab('dashboard');
                              setIsOpen(false);
                            }}
                            className="flex items-center gap-1 text-red-400 hover:text-red-300 font-medium"
                          >
                            سجل المخاطر <ChevronLeft className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 text-center">
            <button
              onClick={() => {
                if (onNavigateToTab) onNavigateToTab('dashboard');
                setIsOpen(false);
              }}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center justify-center gap-1 w-full"
            >
              عرض لوحة القيادة والمؤشرات <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
