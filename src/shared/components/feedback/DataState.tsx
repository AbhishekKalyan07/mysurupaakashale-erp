import type { ReactNode } from 'react';
import { ErrorState } from './ErrorState';
import { EmptyState } from './EmptyState';
import {
  TableSkeleton,
  DashboardCardsSkeleton,
  CardSkeleton,
  FormSkeleton,
  ChartSkeleton,
  ListSkeleton,
  PageSkeleton,
} from './SkeletonLoader';

export type SkeletonType =
  | 'table'
  | 'dashboard-cards'
  | 'card'
  | 'form'
  | 'chart'
  | 'list'
  | 'page';

export interface DataStateProps<T> {
  /** If true, renders the chosen skeleton */
  isLoading: boolean;
  /** If present, renders an ErrorState with a retry option */
  error: Error | null;
  /** The data to check for emptiness */
  data: T | null | undefined;
  /** What skeleton layout to use while loading */
  skeletonType?: SkeletonType;
  /** Called if the user clicks "Try again" on an error */
  onRetry?: () => void;
  
  // -- Empty state props --
  /** Title shown when data is empty */
  emptyTitle?: string;
  /** Subtitle shown when data is empty */
  emptyDescription?: string;
  /** Optional generic icon */
  emptyIcon?: ReactNode;
  /** Optional full-size illustration (overrides emptyIcon) */
  emptyIllustration?: ReactNode;
  /** Primary call to action when empty (e.g., Create Button) */
  emptyAction?: ReactNode;
  /** Secondary action when empty */
  emptySecondaryAction?: ReactNode;
  
  /** Custom emptiness check (defaults to checking if arrays are length 0, or objects are null) */
  isEmpty?: (data: T) => boolean;

  /** The actual content to render when data is loaded, error-free, and not empty */
  children: ReactNode;
}

function renderSkeleton(type: SkeletonType) {
  switch (type) {
    case 'table':
      return <TableSkeleton rows={5} />;
    case 'dashboard-cards':
      return <DashboardCardsSkeleton count={4} />;
    case 'form':
      return <FormSkeleton />;
    case 'chart':
      return <ChartSkeleton />;
    case 'list':
      return <ListSkeleton />;
    case 'page':
      return <PageSkeleton />;
    case 'card':
    default:
      return <CardSkeleton />;
  }
}

function isDataEmpty(data: any): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data) && data.length === 0) return true;
  return false;
}

/**
 * A centralized data wrapper that radically reduces boilerplate in dashboard and list views.
 * Automatically handles Loading (shimmer), Error (retry prompt), Empty (illustration),
 * and Success (children) states.
 */
export function DataState<T>({
  isLoading,
  error,
  data,
  skeletonType = 'card',
  onRetry,
  emptyTitle = 'No data found',
  emptyDescription,
  emptyIcon,
  emptyIllustration,
  emptyAction,
  emptySecondaryAction,
  isEmpty,
  children,
}: DataStateProps<T>) {
  if (error) {
    return (
      <ErrorState
        title="Failed to load data"
        description={error.message || 'An unexpected error occurred while fetching data.'}
        onRetry={onRetry}
      />
    );
  }

  if (isLoading) {
    return <div className="w-full">{renderSkeleton(skeletonType)}</div>;
  }

  const dataEmpty = isEmpty ? isEmpty(data as T) : isDataEmpty(data);

  if (dataEmpty) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        icon={emptyIcon}
        illustration={emptyIllustration}
        action={emptyAction}
        secondaryAction={emptySecondaryAction}
      />
    );
  }

  return <>{children}</>;
}
