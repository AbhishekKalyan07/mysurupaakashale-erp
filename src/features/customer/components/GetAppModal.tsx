import { useState } from "react";
import {
  X,
  Smartphone,
  Download,
  Share,
  CheckCircle2,
  MoreHorizontal,
  Plus,
  Monitor,
} from "lucide-react";
import { PremiumButton as Button } from "@/shared/components/ui/PremiumButton";
import { usePWAInstall } from "@/shared/hooks/usePWAInstall";
import { cn } from "@/shared/lib/cn";

const BENEFITS = [
  {
    icon: "⚡",
    title: "Instant Access",
    desc: "1-tap skip, pause, and feedback from your home screen",
  },
  {
    icon: "🔔",
    title: "Live Driver Updates",
    desc: "Real-time ETA & doorstep notifications when meals arrive",
  },
  {
    icon: "📶",
    title: "Works Offline",
    desc: "View your schedule and order history even without internet",
  },
];

function IOSInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted font-medium text-center">
        Open this page in <strong className="text-primary">Safari</strong> and follow these steps:
      </p>
      <div className="space-y-2">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-border">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
            1
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Tap the Share button</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Share size={16} className="text-secondary" />
              <p className="text-xs text-text-muted">
                Look for the share icon (□ with an arrow) at the bottom of Safari
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-border">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
            2
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Tap "Add to Home Screen"</p>
            <div className="flex items-center gap-1.5 mt-1">
              <Plus size={16} className="text-secondary" />
              <p className="text-xs text-text-muted">
                Scroll down the share sheet and tap <strong>Add to Home Screen</strong>
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-border">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
            3
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Tap "Add" to confirm</p>
            <p className="text-xs text-text-muted mt-1">
              The app icon will appear on your home screen like a native app
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AndroidInstructions() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted font-medium text-center">
        Follow these steps in your browser:
      </p>
      <div className="space-y-2">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-border">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
            1
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Open browser menu</p>
            <div className="flex items-center gap-1.5 mt-1">
              <MoreHorizontal size={16} className="text-secondary" />
              <p className="text-xs text-text-muted">
                Tap the three-dot menu (⋮) in the top right corner of Chrome
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-border">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
            2
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Select "Install App" or "Add to Home screen"</p>
            <p className="text-xs text-text-muted mt-1">
              Look for <strong>Install App</strong> or <strong>Add to Home screen</strong> option
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-border">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
            3
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Tap "Install" to confirm</p>
            <p className="text-xs text-text-muted mt-1">
              The app will be added to your home screen and app drawer
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const APP_URL = "https://app.mysurupaakashale.in";
const QR_SRC = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=1a1a2e&bgcolor=ffffff&qzone=1&data=${encodeURIComponent(APP_URL)}`;

function DesktopInstructions() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted font-medium text-center">
        Install via <strong className="text-primary">Chrome or Edge</strong> on this computer:
      </p>

      {/* Chrome / Edge steps */}
      <div className="space-y-2">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-border">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
            1
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Click the install icon in the address bar</p>
            <p className="text-xs text-text-muted mt-1">
              Look for the <strong>⊕</strong> or computer icon on the right side of your URL bar
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 rounded-xl bg-surface-2 border border-border">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shrink-0">
            2
          </div>
          <div>
            <p className="text-sm font-semibold text-text">Click "Install" in the popup</p>
            <p className="text-xs text-text-muted mt-1">
              The app opens in its own window, like a native desktop app
            </p>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">or open on mobile</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* QR Code */}
      <div className="flex flex-col items-center gap-3">
        <div className="p-3 bg-white rounded-[16px] border-2 border-border shadow-sm">
          <img
            src={QR_SRC}
            alt="QR code to open Mysuru Paakashale app on mobile"
            width={160}
            height={160}
            className="block"
          />
        </div>
        <div className="text-center">
          <p className="text-xs text-text-muted">Scan with your phone camera to open</p>
          <p className="text-[11px] font-mono text-primary/70 mt-0.5 select-all">{APP_URL}</p>
        </div>
      </div>
    </div>
  );
}

export function GetAppModal() {
  const { isModalOpen, closeModal, isIOS, isAndroid, canPromptDirectly, triggerInstall, isInstalled } = usePWAInstall();
  const isDesktop = !isIOS && !isAndroid;
  const [showInstructions, setShowInstructions] = useState(false);
  const [installDone, setInstallDone] = useState(false);

  const handleInstall = async () => {
    if (canPromptDirectly) {
      const result = await triggerInstall();
      if (result === "accepted") {
        setInstallDone(true);
      } else if (result === "instructions_opened") {
        setShowInstructions(true);
      }
    } else {
      setShowInstructions(true);
    }
  };

  const renderInstructions = () => {
    if (isIOS) return <IOSInstructions />;
    if (isAndroid) return <AndroidInstructions />;
    return <DesktopInstructions />;
  };

  const headerIcon = isDesktop ? Monitor : Smartphone;

  if (!isModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Install Mysuru Paakashale App"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeModal}
      />

      {/* Modal */}
      <div className="relative bg-card rounded-[24px] border border-border shadow-2xl w-full max-w-md mx-auto overflow-hidden animate-in slide-in-from-bottom duration-300 sm:slide-in-from-bottom-0 sm:zoom-in-95 max-h-[90dvh] flex flex-col">
        {/* Gold accent bar */}
        <div className="h-1 bg-gradient-to-r from-gold via-secondary to-gold shrink-0" />

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-[14px] bg-primary/5 border border-primary/10">
              {isDesktop
                ? <Monitor size={22} className="text-gold" />
                : <Smartphone size={22} className="text-gold" />}
            </div>
            <div>
              <h2 className="text-lg font-display font-bold text-primary">
                {isInstalled ? "App Already Installed" : "Get the App"}
              </h2>
              <p className="text-[11px] text-text-muted font-medium mt-0.5">
                Mysuru Paakashale · Free Forever
              </p>
            </div>
          </div>
          <button
            onClick={closeModal}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-2 text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-5 pb-5 space-y-5">
          {installDone ? (
            /* Success state */
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 bg-success-subtle rounded-full flex items-center justify-center mx-auto border-2 border-success/30">
                <CheckCircle2 className="text-success" size={32} />
              </div>
              <h3 className="text-xl font-display font-bold text-success">
                App Installed!
              </h3>
              <p className="text-sm text-text-muted max-w-xs mx-auto">
                Mysuru Paakashale has been added to your home screen. Enjoy instant access to your meals!
              </p>
              <Button
                onClick={closeModal}
                variant="success-tonal"
                size="md"
                className="w-full mt-2 font-bold"
              >
                Got It
              </Button>
            </div>
          ) : isInstalled ? (
            /* Already installed state */
            <div className="text-center py-4 space-y-3">
              <div className="w-14 h-14 bg-secondary/10 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="text-secondary" size={28} />
              </div>
              <p className="text-sm text-text-muted">
                You're already using the installed app. Enjoy the full experience!
              </p>
              <Button onClick={closeModal} size="md" className="w-full font-bold">
                Continue
              </Button>
            </div>
          ) : showInstructions ? (
            /* Platform-specific instructions */
            <div className="space-y-4">
              <button
                onClick={() => setShowInstructions(false)}
                className="text-xs text-text-muted hover:text-text flex items-center gap-1"
              >
                ← Back
              </button>
              {renderInstructions()}
            </div>
          ) : (
            /* Default — benefits + install */
            <>
              {/* Benefits */}
              <div className="grid gap-2.5">
                {BENEFITS.map((b) => (
                  <div
                    key={b.title}
                    className="flex items-start gap-3 p-3 rounded-[14px] bg-surface-2 border border-border"
                  >
                    <span className="text-xl leading-none mt-0.5">{b.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-text">{b.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">{b.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Install CTA */}
              <div className="space-y-2.5 pt-1">
                <Button
                  onClick={handleInstall}
                  size="lg"
                  className="w-full font-bold gap-2"
                >
                  <Download size={18} />
                  {canPromptDirectly ? "Install App — 1 Tap" : "How to Install"}
                </Button>

                {/* Always show step-by-step link when native prompt unavailable */}
                {!canPromptDirectly && (
                  <button
                    onClick={() => setShowInstructions(true)}
                    className="w-full text-xs text-text-muted hover:text-text text-center py-1 transition-colors"
                  >
                    {isDesktop ? "View desktop install guide" : "View step-by-step guide"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Inline trigger card for use inside pages (e.g. CustomerOrderHistoryPage) */
export function GetAppInlineCard({ className }: { className?: string }) {
  const { triggerInstall, isInstalled, canPromptDirectly } = usePWAInstall();

  if (isInstalled) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 p-4 rounded-[18px] border border-secondary/30 bg-gradient-to-r from-pastel-lavender/60 to-pastel-lavender/30",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-[12px] bg-card border border-secondary/20 shadow-xs">
          <Smartphone size={20} className="text-secondary" />
        </div>
        <div>
          <p className="text-sm font-display font-bold text-primary">Get the App</p>
          <p className="text-xs text-text-muted">Instant access · Live updates · Free</p>
        </div>
      </div>
      <Button
        variant="tonal"
        size="sm"
        onClick={() => triggerInstall()}
        className="shrink-0 font-bold text-xs gap-1.5"
      >
        <Download size={13} />
        {canPromptDirectly ? "Install" : "How to"}
      </Button>
    </div>
  );
}
