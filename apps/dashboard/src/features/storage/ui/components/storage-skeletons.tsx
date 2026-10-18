import { Skeleton } from '@/shared/ui/components/shadcn/skeleton';

/** Fallback for the storage page while its usage and retention load. */
export function StorageSkeleton() {
  return (
    <div className="space-y-10" aria-hidden="true">
      <div className="space-y-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-2.5 w-full rounded-full" />
        <div className="flex gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-28" />
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b py-5"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
            <Skeleton className="h-9 w-72" />
          </div>
        ))}
      </div>
    </div>
  );
}
