import type { ReactNode } from 'react';
import { Card } from '@/shared/components/ui/Card';
import { useAuth } from '@/features/auth/hooks/useAuth';

interface WelcomeCardProps {
  icon: ReactNode;
  roleTagline: string;
  comingNext: string[];
}

/** Phase 0 ships one real, working page per role: this one. Every bullet below becomes a real feature in that role's own phase. */
export function WelcomeCard({ icon, roleTagline, comingNext }: WelcomeCardProps) {
  const { profile } = useAuth();
  const firstName = profile?.fullName.split(' ')[0] || 'there';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Card className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-leaf-50 text-leaf-700">{icon}</div>
        <div>
          <h1 className="font-display text-xl text-ink-900">Welcome, {firstName}</h1>
          <p className="mt-1 text-sm text-ink-600">{roleTagline}</p>
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-base text-ink-900">Coming to this dashboard</h2>
        <ul className="mt-3 space-y-2">
          {comingNext.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-ink-600">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-turmeric-400" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
