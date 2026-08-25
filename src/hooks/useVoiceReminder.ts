import { useState, useEffect, useRef, useCallback } from 'react';

export interface VoiceReminderSettings {
  enabled: boolean;
  intervalMinutes: number; // e.g. 2, 5, 10
  volume: number; // 0.1 to 1.0
  announceAiCompletions: boolean;
}

const DEFAULT_SETTINGS: VoiceReminderSettings = {
  enabled: true,
  intervalMinutes: 5,
  volume: 0.9,
  announceAiCompletions: true,
};

// Generates a soft harmonic chime using Web Audio API
function playChimeSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Note 1: 523.25 Hz (C5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    // Note 2: 880 Hz (A5) with slight delay
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
    gain2.gain.setValueAtTime(0, now + 0.12);
    gain2.gain.linearRampToValueAtTime(0.2, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.8);
  } catch (e) {
    console.warn('Audio chime notice:', e);
  }
}

export function useVoiceReminder(tasks: any[] = []) {
  const [settings, setSettings] = useState<VoiceReminderSettings>(() => {
    try {
      const saved = localStorage.getItem('smart_audit_voice_reminder_cfg');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastAnnouncedTaskId, setLastAnnouncedTaskId] = useState<number | null>(null);
  const [lastAnnouncedTime, setLastAnnouncedTime] = useState<Date | null>(null);

  const timerRef = useRef<any>(null);
  const tasksRef = useRef<any[]>(tasks);
  tasksRef.current = tasks;

  // Save settings on update
  const updateSettings = useCallback((newSettings: Partial<VoiceReminderSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      try {
        localStorage.setItem('smart_audit_voice_reminder_cfg', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  }, []);

  // Speak Arabic Text with Web Speech Synthesis
  const speakText = useCallback((text: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel(); // cancel prior speaking
    playChimeSound();

    setTimeout(() => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar-SA';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = settings.volume;

        // Try to pick an Arabic voice if available
        const voices = window.speechSynthesis.getVoices();
        const arabicVoice = voices.find(v => v.lang.startsWith('ar') || v.name.toLowerCase().includes('arabic') || v.name.toLowerCase().includes('maged') || v.name.toLowerCase().includes('tarik') || v.name.toLowerCase().includes('laila') || v.name.toLowerCase().includes('salma'));
        if (arabicVoice) {
          utterance.voice = arabicVoice;
        }

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
          setIsSpeaking(false);
          if (onEnd) onEnd();
        };
        utterance.onerror = () => setIsSpeaking(false);

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('Speech synthesis error:', err);
        setIsSpeaking(false);
      }
    }, 400);
  }, [settings.volume]);

  // Periodic Reminder logic
  const checkAndAnnounceReminders = useCallback(() => {
    if (!settings.enabled) return;
    const pendingTasks = (tasksRef.current || []).filter(t => t.status !== 'COMPLETED');
    if (pendingTasks.length === 0) return;

    // Pick top high priority or upcoming task
    const urgentTask = pendingTasks.find(t => t.priority === 'URGENT' || t.priority === 'HIGH') || pendingTasks[0];
    if (!urgentTask) return;

    const speechMessage = `تنبيه صوتي رقابي: نود تذكيركم بأن المهمة "${urgentTask.title}" قيد المتابعة والمطلوب إنجازها. المسؤول: ${urgentTask.assignee || 'الإدارة المعنية'}.`;
    
    speakText(speechMessage, () => {
      setLastAnnouncedTaskId(urgentTask.id);
      setLastAnnouncedTime(new Date());
    });
  }, [settings.enabled, speakText]);

  // Setup periodic interval timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (settings.enabled && settings.intervalMinutes > 0) {
      const intervalMs = settings.intervalMinutes * 60 * 1000;
      timerRef.current = setInterval(() => {
        checkAndAnnounceReminders();
      }, intervalMs);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [settings.enabled, settings.intervalMinutes, checkAndAnnounceReminders]);

  // Instant Audible Briefing of all pending tasks
  const announceAllPendingTasks = useCallback(() => {
    const pendingTasks = (tasksRef.current || []).filter(t => t.status !== 'COMPLETED');
    if (pendingTasks.length === 0) {
      speakText('لا توجد مهام معلقة حالياً، جميع التكليفات والمهام مكتملة بنجاح.');
      return;
    }

    const taskTitles = pendingTasks.slice(0, 3).map((t, idx) => `المهمة رقم ${idx + 1}: ${t.title}`).join('، و ');
    const fullMessage = `إيجاز المهام الرقابية: لديكم حالياً ${pendingTasks.length} مهام قيد المتابعة. أبرزها: ${taskTitles}.`;
    speakText(fullMessage);
  }, [speakText]);

  // Instant announcement when AI finishes a deliverable
  const announceDeliverableCompleted = useCallback((taskTitle: string) => {
    if (!settings.announceAiCompletions) return;
    const msg = `تم بنجاح إنجاز التكليف بالذكاء الاصطناعي: ${taskTitle}. الوثيقة جاهزة للمراجعة والطباعة والتصدير في قسم مهام الذكاء الاصطناعي.`;
    speakText(msg);
  }, [settings.announceAiCompletions, speakText]);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  return {
    settings,
    updateSettings,
    isSpeaking,
    lastAnnouncedTaskId,
    lastAnnouncedTime,
    speakText,
    stopSpeaking,
    announceAllPendingTasks,
    announceDeliverableCompleted,
    playChimeSound
  };
}
