import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Monitor, Share2, PlusSquare, X, CheckCircle2, Sparkles, ExternalLink } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already running in standalone mode (installed PWA)
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      
      setIsStandalone(isStandaloneMode);
      if (isStandaloneMode) {
        setIsInstalled(true);
      }
    };

    checkStandalone();

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // Listen for BeforeInstallPrompt on Chrome, Edge, Android
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Check if user previously dismissed banner in session
      const dismissed = sessionStorage.getItem('pwa_banner_dismissed');
      if (!dismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowBanner(false);
      setShowModal(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    // On iOS, show banner after 3 seconds if not standalone and not dismissed
    if (isIosDevice && !isStandalone) {
      const dismissed = sessionStorage.getItem('pwa_banner_dismissed');
      if (!dismissed) {
        const timer = setTimeout(() => setShowBanner(true), 3500);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isStandalone]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setShowBanner(false);
          setShowModal(false);
        }
        setDeferredPrompt(null);
      } catch (err) {
        console.error('Error during PWA install:', err);
        setShowModal(true);
      }
    } else {
      // Fallback for iOS or unsupported browsers: show instructional modal
      setShowModal(true);
    }
  };

  const handleDismissBanner = () => {
    setShowBanner(false);
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
  };

  if (isStandalone || isInstalled) {
    return null; // App is already installed and opened as native app
  }

  return (
    <>
      {/* 1. Header Quick Install Action Button */}
      <button
        id="pwa-header-install-btn"
        onClick={handleInstallClick}
        title="تثبيت التطبيق على جهازك"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-900/20 border border-emerald-500/40 transition-all cursor-pointer hover:scale-105 active:scale-95 shrink-0 animate-pulse"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">تثبيت التطبيق</span>
        <span className="sm:hidden">تثبيت 📲</span>
      </button>

      {/* 2. Floating Bottom Mobile/Desktop Install Prompt Banner */}
      {showBanner && (
        <div 
          id="pwa-floating-banner"
          className="fixed bottom-4 right-4 left-4 sm:right-auto sm:left-6 sm:max-w-md z-50 bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-4 shadow-2xl shadow-black/80 flex flex-col gap-3 transition-all animate-in fade-in slide-in-from-bottom-5"
          dir="rtl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  تثبيت برنامج «الخبير الذكي»
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  ثبّت التطبيق كبرنامج مستقل على شاشتك لتجربة فورية سريعة وبدون متصفح.
                </p>
              </div>
            </div>
            <button
              onClick={handleDismissBanner}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
            <button
              onClick={handleInstallClick}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-xl text-xs shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              تثبيت التطبيق الآن
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-3 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors font-medium cursor-pointer"
            >
              طريقة التثبيت
            </button>
          </div>
        </div>
      )}

      {/* 3. Detailed Instructions Modal (Supports iOS Safari, Chrome, Edge, Android, Desktop) */}
      {showModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-5 left-5 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">تثبيت تطبيق «الخبير الذكي»</h3>
                <p className="text-xs text-slate-400">طريقة تثبيت المنصة كبرنامج رسمي على جهازك</p>
              </div>
            </div>

            {/* Direct Trigger button if available */}
            {deferredPrompt && (
              <div className="mb-6 p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-emerald-300">التثبيت التلقائي متاح لمتصفحك!</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">اضغط على الزر ليتم تثبيت التطبيق بنقرة واحدة.</p>
                </div>
                <button
                  onClick={handleInstallClick}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/30 transition-all shrink-0 cursor-pointer"
                >
                  تثبيت فوري
                </button>
              </div>
            )}

            {/* Device-Specific Guides */}
            <div className="space-y-4 text-xs">
              {/* iOS Guide */}
              <div className={`p-4 rounded-2xl border ${isIOS ? 'bg-blue-950/30 border-blue-500/40' : 'bg-slate-800/60 border-slate-700/60'}`}>
                <div className="flex items-center gap-2 mb-2 font-bold text-sm text-white">
                  <Smartphone className="w-4 h-4 text-blue-400" />
                  <span>طريقة التثبيت على الآيفون والآيباد (iPhone / iPad - Safari):</span>
                </div>
                <ol className="space-y-2 text-slate-300 mr-2 list-decimal list-inside">
                  <li>افتح الرابط في متصفح <strong className="text-white">Safari</strong>.</li>
                  <li className="flex items-center gap-1.5 flex-wrap">
                    اضغط على زر <strong className="text-white">المشاركة</strong> 
                    <span className="inline-flex items-center justify-center px-2 py-0.5 bg-slate-700 rounded text-blue-400 font-mono text-[11px]">
                      <Share2 className="w-3 h-3 ml-1" /> ⬆️ أسفل الشاشة
                    </span>
                  </li>
                  <li className="flex items-center gap-1.5 flex-wrap">
                    مرر للأسفل واختر 
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600/30 border border-blue-500/40 rounded text-blue-300 font-bold text-[11px]">
                      <PlusSquare className="w-3 h-3" /> إضافة إلى الصفحة الرئيسية (Add to Home Screen)
                    </span>
                  </li>
                  <li>اضغط <strong className="text-white">«إضافة» (Add)</strong> في أعلى الزاوية.</li>
                </ol>
              </div>

              {/* Android & Desktop Guide */}
              <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700/60">
                <div className="flex items-center gap-2 mb-2 font-bold text-sm text-white">
                  <Monitor className="w-4 h-4 text-teal-400" />
                  <span>طريقة التثبيت على أجهزة أندرويد والكمبيوتر (Android / Chrome / Edge):</span>
                </div>
                <ol className="space-y-2 text-slate-300 mr-2 list-decimal list-inside">
                  <li>اضغط على خيارات المتصفح (القائمة <strong className="text-white">⋮</strong> في الأعلى).</li>
                  <li>اختر <strong className="text-teal-300">«تثبيت التطبيق» (Install App)</strong> أو <strong className="text-teal-300">«إضافة إلى الشاشة الرئيسية»</strong>.</li>
                  <li>وافق على التثبيت وسينزل البرنامج فوراً على سطح المكتب وشاشة هاتفك.</li>
                </ol>
              </div>
            </div>

            {/* Features Highlight */}
            <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                <p className="text-[11px] font-bold text-white">بدون متجر</p>
                <p className="text-[10px] text-slate-400">تثبيت بنقرة واحدة</p>
              </div>
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <Sparkles className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                <p className="text-[11px] font-bold text-white">شاشة كاملة</p>
                <p className="text-[10px] text-slate-400">كتطبيق أصلي تماماً</p>
              </div>
              <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <ExternalLink className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                <p className="text-[11px] font-bold text-white">تحديث تلقائي</p>
                <p className="text-[10px] text-slate-400">دون الحاجة لإعادة تنزيل</p>
              </div>
            </div>

            {/* Footer Close Action */}
            <div className="mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                فهمت، حسناً
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
