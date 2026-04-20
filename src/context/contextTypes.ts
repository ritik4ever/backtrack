export interface Decision {
  id: string;
  date: string;
  title: string;
  description: string;
  alternativesConsidered: string[];
  reason: string;
  filesAffected: string[];
  sessionId: string;
  status: 'active' | 'superseded' | 'reverted';
  tags: string[];
}

export interface FileContext {
  purpose: string;
  created: string;
  lastDiscussed: string;
  sessionCount: number;
  context: string;
  dependencies: string[];
  relatedFiles: string[];
  knownIssues: string[];
  conventions: string;
}

export interface Bug {
  id: string;
  title: string;
  discovered: string;
  sessionId: string;
  rootCause: string;
  fix: string;
  status: 'open' | 'fixed' | 'partial' | 'wontfix';
  files: string[];
  workaround: string;
}

export interface Convention {
  rule: string;
  reason: string;
  established: string;
  sessionId: string;
}

export interface Dependency {
  name: string;
  version: string;
  purpose: string;
  addedDate: string;
  sessionId: string;
  type: 'npm' | 'cargo' | 'pip' | 'gem' | 'go' | 'other';
  alternatives: string[];
}

export interface TodoItem {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  mentioned: string;
  sessionId: string;
  status: 'open' | 'done' | 'cancelled';
  context: string;
}

export interface TimelineEvent {
  date: string;
  type: 'milestone' | 'decision' | 'bug' | 'refactor' | 'deploy' | 'note';
  title: string;
  sessionId: string;
  description?: string;
}

export interface StackInfo {
  languages: string[];
  frontend: string[];
  backend: string[];
  testing: string[];
  build: string[];
  databases: string[];
  other: string[];
}

export interface QuickContext {
  currentFocus: string;
  recentDecisions: string[];
  openIssues: string[];
  lastSession: { id: string; date: string; summary: string } | null;
}

export interface ContextMap {
  version: number;
  project: string;
  projectPath: string;
  lastUpdated: string;
  sessionsAnalyzed: number;
  analyzedSessions: string[];
  stack: StackInfo;
  entryPoints: {
    decisions: string;
    files: string;
    bugs: string;
    conventions: string;
    dependencies: string;
    todos: string;
    timeline: string;
  };
  quickContext: QuickContext;
}

export interface EntityStore {
  decisions: Decision[];
  files: Record<string, FileContext>;
  bugs: Bug[];
  conventions: Convention[];
  dependencies: Dependency[];
  todos: TodoItem[];
  timeline: TimelineEvent[];
}

export interface MapOptions {
  projectPath: string;
  claudeDir: string;
  incremental?: boolean;
  reset?: boolean;
  verbose?: boolean;
}
