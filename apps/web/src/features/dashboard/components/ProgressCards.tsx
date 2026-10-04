import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DepartmentProgress, ProjectProgress } from '../data/types';

/** Segment under the big number — value colored per the mockup (spec §5.1). */
interface Segment {
  label: string;
  value: number;
  tone: 'success' | 'danger' | 'neutral';
}

const TONE_CLASS: Record<Segment['tone'], string> = {
  success: 'text-success',
  danger: 'text-danger',
  neutral: 'text-foreground',
};

function StatCard({
  title,
  kicker,
  totalLabel,
  value,
  segments,
}: {
  /** Card title first, uppercase kicker beneath (mockup order). */
  title: string;
  kicker: string;
  totalLabel: string;
  value: number;
  segments: Segment[];
}) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <h2 className="font-semibold text-base text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {kicker}
        </p>

        <div className="mt-4 flex items-baseline gap-2.5">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            {totalLabel}
          </span>
          <span className="font-display text-4xl font-bold text-foreground">
            {value.toLocaleString('en-US')}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {segments.map((segment) => (
            <span key={segment.label} className="inline-flex items-baseline gap-2 text-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {segment.label}
              </span>
              <strong className={cn('font-display text-base font-bold', TONE_CLASS[segment.tone])}>
                {segment.value}
              </strong>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectProgressCard({ project }: { project: ProjectProgress }) {
  return (
    <StatCard
      title="Project Progress"
      kicker="Aggregate Thesis Status"
      totalLabel="Total"
      value={project.total}
      segments={[
        { label: 'Active', value: project.active, tone: 'success' },
        { label: 'Completed', value: project.completed, tone: 'success' },
        { label: 'Archived', value: project.archived, tone: 'neutral' },
      ]}
    />
  );
}

export function DepartmentProgressCard({ department }: { department: DepartmentProgress }) {
  return (
    <StatCard
      title="Department Progress"
      kicker="Department Overview"
      totalLabel="Students"
      value={department.students}
      segments={[
        { label: 'Faculty', value: department.faculty, tone: 'success' },
        { label: 'Awaiting review', value: department.awaiting, tone: 'danger' },
      ]}
    />
  );
}
