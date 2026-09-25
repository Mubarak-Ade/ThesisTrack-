import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { DepartmentProgress, ProjectProgress } from '../data/types';

interface Segment {
  label: string;
  dotClass: string;
}

function StatCard({
  kicker,
  value,
  unit,
  segments,
  progress,
  caption,
}: {
  kicker: string;
  value: number;
  unit: string;
  segments: Segment[];
  /** Optional coverage bar (0–100). */
  progress?: number;
  caption?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{kicker}</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold text-foreground">
            {value.toLocaleString('en-US')}
          </span>
          <span className="text-sm font-medium text-muted-foreground">{unit}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {segments.map((segment) => (
            <span key={segment.label} className="inline-flex items-center gap-2 text-sm text-foreground">
              <span className={`size-2 rounded-full ${segment.dotClass}`} aria-hidden="true" />
              {segment.label}
            </span>
          ))}
        </div>
        {progress !== undefined && (
          <div className="mt-4">
            <Progress value={progress} aria-label="Supervisor coverage" />
            {caption && <p className="mt-2 text-xs text-muted-foreground">{caption}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProjectProgressCard({ project }: { project: ProjectProgress }) {
  return (
    <StatCard
      kicker="Project Progress"
      value={project.total}
      unit="Total Projects"
      segments={[
        { label: `${project.active} Active`, dotClass: 'bg-primary' },
        { label: `${project.completed} Completed`, dotClass: 'bg-success' },
        { label: `${project.atRisk} At Risk`, dotClass: 'bg-danger' },
      ]}
    />
  );
}

export function DepartmentProgressCard({ department }: { department: DepartmentProgress }) {
  const coverage = Math.round((department.assigned / department.students) * 100);
  return (
    <StatCard
      kicker="Department Progress"
      value={department.students}
      unit="Students"
      segments={[
        { label: `${department.assigned.toLocaleString('en-US')} Assigned`, dotClass: 'bg-success' },
        { label: `${department.unassigned} Unassigned`, dotClass: 'bg-danger' },
      ]}
      progress={coverage}
      caption={`${coverage}% supervisor coverage`}
    />
  );
}
