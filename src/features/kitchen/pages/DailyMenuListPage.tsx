import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Globe, Archive, CalendarDays } from 'lucide-react';
import { PremiumCard as Card } from '@/shared/components/ui/PremiumCard';
import { PremiumButton as Button } from '@/shared/components/ui/PremiumButton';
import { PremiumBadge as Badge } from '@/shared/components/ui/PremiumBadge';
import { TableSkeleton } from '@/shared/components/feedback/SkeletonLoader';
import { ErrorState } from '@/shared/components/feedback/ErrorState';
import { EmptyState } from '@/shared/components/feedback/EmptyState';
import { useDailyMenus, useDeleteDailyMenu, usePublishDailyMenu, useArchiveDailyMenu } from '../hooks/useDailyMenu';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { DailyMenu } from '@/shared/types';

export function DailyMenuListPage() {
  const navigate = useNavigate();
  const { data: menus, isLoading, isError, error, refetch } = useDailyMenus();
  const { role } = useAuth();
  
  const deleteMutation = useDeleteDailyMenu();
  const publishMutation = usePublishDailyMenu();
  const archiveMutation = useArchiveDailyMenu();

  if (isLoading) return <div className="p-8"><TableSkeleton /></div>;

  if (isError) {
    return (
      <ErrorState
        title="Could not load menus"
        description={error?.message || 'Something went wrong.'}
        onRetry={refetch}
      />
    );
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this draft menu?')) return;
    await deleteMutation.mutateAsync(id);
  };

  const handlePublish = async (id: string) => {
    if (!confirm('Publishing this menu will archive any currently published menu for the same date. Continue?')) return;
    await publishMutation.mutateAsync(id);
  };

  const handleArchive = async (id: string) => {
    if (!confirm('Are you sure you want to archive this menu?')) return;
    await archiveMutation.mutateAsync(id);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-900 flex items-center gap-2">
            <CalendarDays size={28} className="text-leaf-600" />
            Daily Menus
          </h1>
          <p className="text-sm text-ink-500 font-sans mt-1">
            Manage daily breakfast, lunch, and dinner menus.
          </p>
        </div>
        <Button onClick={() => navigate(`/${role}/menus/new`)} className="shrink-0">
          <Plus size={16} />
          Create Menu
        </Button>
      </div>

      {menus?.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={40} className="text-leaf-300" />}
          title="No menus found"
          description="Create a new daily menu to get started."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menus?.map((menu) => (
            <MenuCard
              key={menu.id}
              menu={menu}
              role={role ?? 'kitchen'}
              onDelete={handleDelete}
              onPublish={handlePublish}
              onArchive={handleArchive}
              isActionLoading={deleteMutation.isPending || publishMutation.isPending || archiveMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuCard({
  menu,
  role,
  onDelete,
  onPublish,
  onArchive,
  isActionLoading
}: {
  menu: DailyMenu;
  role: string;
  onDelete: (id: string) => void;
  onPublish: (id: string) => void;
  onArchive: (id: string) => void;
  isActionLoading: boolean;
}) {
  const isDraft = menu.status === 'draft';
  const isPublished = menu.status === 'published';

  return (
    <Card className="flex flex-col h-full overflow-hidden transition-shadow hover:shadow-card-hover">
      <div className="p-4 border-b border-rice-200 bg-rice-25 flex items-center justify-between">
        <h3 className="font-display font-bold text-ink-900 text-lg">
          {new Intl.DateTimeFormat('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          }).format(new Date(menu.date))}
        </h3>
        <Badge variant={isPublished ? 'success' : isDraft ? 'warning' : 'default'}>
          {menu.status}
        </Badge>
      </div>
      
      <div className="p-4 flex-1 space-y-3 font-sans text-sm">
        <div>
          <span className="text-ink-500 text-xs font-semibold uppercase tracking-wider">Breakfast</span>
          <p className="text-ink-900 line-clamp-1">{menu.breakfast.name || 'Not set'}</p>
        </div>
        <div>
          <span className="text-ink-500 text-xs font-semibold uppercase tracking-wider">Lunch</span>
          <p className="text-ink-900 line-clamp-1">{menu.lunch.name || 'Not set'}</p>
        </div>
        <div>
          <span className="text-ink-500 text-xs font-semibold uppercase tracking-wider">Dinner</span>
          <p className="text-ink-900 line-clamp-1">{menu.dinner.name || 'Not set'}</p>
        </div>
      </div>

      <div className="p-4 pt-0 flex gap-2 justify-end">
        {(isDraft || isPublished) && (
          <Link to={`/${role}/menus/${menu.id}/edit`}>
            <Button variant="secondary" size="sm">
              <Edit size={14} />
              Edit
            </Button>
          </Link>
        )}
        {isDraft && (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onPublish(menu.id)}
              disabled={isActionLoading}
            >
              <Globe size={14} />
              Publish
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => onDelete(menu.id)}
              disabled={isActionLoading}
              aria-label="Delete draft"
            >
              <Trash2 size={14} />
            </Button>
          </>
        )}
        {isPublished && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onArchive(menu.id)}
            disabled={isActionLoading}
          >
            <Archive size={14} />
            Archive
          </Button>
        )}
      </div>
    </Card>
  );
}
