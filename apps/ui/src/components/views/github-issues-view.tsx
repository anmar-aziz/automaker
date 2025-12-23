import { useState, useEffect, useCallback } from 'react';
import {
  CircleDot,
  Loader2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Circle,
  X,
  Wand2,
  GitPullRequest,
  User,
} from 'lucide-react';
import {
  getElectronAPI,
  GitHubIssue,
  IssueValidationResult,
  IssueComplexity,
} from '@/lib/electron';

/**
 * Map issue complexity to feature priority.
 * Lower complexity issues get higher priority (1 = high, 2 = medium).
 */
function getFeaturePriority(complexity: IssueComplexity | undefined): number {
  switch (complexity) {
    case 'trivial':
    case 'simple':
      return 1; // High priority for easy wins
    case 'moderate':
    case 'complex':
    case 'very_complex':
    default:
      return 2; // Medium priority for larger efforts
  }
}
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ValidationDialog } from './github-issues-view/validation-dialog';

export function GitHubIssuesView() {
  const [openIssues, setOpenIssues] = useState<GitHubIssue[]>([]);
  const [closedIssues, setClosedIssues] = useState<GitHubIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<GitHubIssue | null>(null);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<IssueValidationResult | null>(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const { currentProject } = useAppStore();

  const fetchIssues = useCallback(async () => {
    if (!currentProject?.path) {
      setError('No project selected');
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const api = getElectronAPI();
      if (api.github) {
        const result = await api.github.listIssues(currentProject.path);
        if (result.success) {
          setOpenIssues(result.openIssues || []);
          setClosedIssues(result.closedIssues || []);
        } else {
          setError(result.error || 'Failed to fetch issues');
        }
      }
    } catch (err) {
      console.error('[GitHubIssuesView] Error fetching issues:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentProject?.path]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchIssues();
  }, [fetchIssues]);

  const handleOpenInGitHub = useCallback((url: string) => {
    const api = getElectronAPI();
    api.openExternalLink(url);
  }, []);

  const handleValidateIssue = useCallback(
    async (issue: GitHubIssue) => {
      if (!currentProject?.path) {
        toast.error('No project selected');
        return;
      }

      setValidating(true);
      setValidationResult(null);
      setShowValidationDialog(true);

      try {
        const api = getElectronAPI();
        if (api.github?.validateIssue) {
          const result = await api.github.validateIssue(currentProject.path, {
            issueNumber: issue.number,
            issueTitle: issue.title,
            issueBody: issue.body || '',
            issueLabels: issue.labels.map((l) => l.name),
          });

          if (result.success) {
            setValidationResult(result.validation);
          } else {
            toast.error(result.error || 'Failed to validate issue');
            setShowValidationDialog(false);
          }
        }
      } catch (err) {
        console.error('[GitHubIssuesView] Validation error:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to validate issue');
        setShowValidationDialog(false);
      } finally {
        setValidating(false);
      }
    },
    [currentProject?.path]
  );

  const handleConvertToTask = useCallback(
    async (issue: GitHubIssue, validation: IssueValidationResult) => {
      if (!currentProject?.path) {
        toast.error('No project selected');
        return;
      }

      try {
        const api = getElectronAPI();
        if (api.features?.create) {
          // Build description from issue body + validation info
          const description = [
            `**From GitHub Issue #${issue.number}**`,
            '',
            issue.body || 'No description provided.',
            '',
            '---',
            '',
            '**AI Validation Analysis:**',
            validation.reasoning,
            validation.suggestedFix ? `\n**Suggested Approach:**\n${validation.suggestedFix}` : '',
            validation.relatedFiles?.length
              ? `\n**Related Files:**\n${validation.relatedFiles.map((f) => `- \`${f}\``).join('\n')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n');

          const feature = {
            id: `issue-${issue.number}-${crypto.randomUUID()}`,
            title: issue.title,
            description,
            category: 'From GitHub',
            status: 'backlog' as const,
            passes: false,
            priority: getFeaturePriority(validation.estimatedComplexity),
            model: 'opus' as const,
            thinkingLevel: 'none' as const,
            branchName: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          const result = await api.features.create(currentProject.path, feature);
          if (result.success) {
            toast.success(`Created task: ${issue.title}`);
          } else {
            toast.error(result.error || 'Failed to create task');
          }
        }
      } catch (err) {
        console.error('[GitHubIssuesView] Convert to task error:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to create task');
      }
    },
    [currentProject?.path]
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
        <div className="p-4 rounded-full bg-destructive/10 mb-4">
          <CircleDot className="h-12 w-12 text-destructive" />
        </div>
        <h2 className="text-lg font-medium mb-2">Failed to Load Issues</h2>
        <p className="text-muted-foreground max-w-md mb-4">{error}</p>
        <Button variant="outline" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  const totalIssues = openIssues.length + closedIssues.length;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Issues List */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-r border-border',
          selectedIssue ? 'w-80' : 'flex-1'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CircleDot className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Issues</h1>
              <p className="text-xs text-muted-foreground">
                {totalIssues === 0
                  ? 'No issues found'
                  : `${openIssues.length} open, ${closedIssues.length} closed`}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
        </div>

        {/* Issues List */}
        <div className="flex-1 overflow-auto">
          {totalIssues === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <div className="p-4 rounded-full bg-muted/50 mb-4">
                <CircleDot className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-base font-medium mb-2">No Issues</h2>
              <p className="text-sm text-muted-foreground">This repository has no issues yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Open Issues */}
              {openIssues.map((issue) => (
                <IssueRow
                  key={issue.number}
                  issue={issue}
                  isSelected={selectedIssue?.number === issue.number}
                  onClick={() => setSelectedIssue(issue)}
                  onOpenExternal={() => handleOpenInGitHub(issue.url)}
                  formatDate={formatDate}
                />
              ))}

              {/* Closed Issues Section */}
              {closedIssues.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                    Closed Issues ({closedIssues.length})
                  </div>
                  {closedIssues.map((issue) => (
                    <IssueRow
                      key={issue.number}
                      issue={issue}
                      isSelected={selectedIssue?.number === issue.number}
                      onClick={() => setSelectedIssue(issue)}
                      onOpenExternal={() => handleOpenInGitHub(issue.url)}
                      formatDate={formatDate}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Issue Detail Panel */}
      {selectedIssue && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Detail Header */}
          <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2 min-w-0">
              {selectedIssue.state === 'OPEN' ? (
                <Circle className="h-4 w-4 text-green-500 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-purple-500 flex-shrink-0" />
              )}
              <span className="text-sm font-medium truncate">
                #{selectedIssue.number} {selectedIssue.title}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="default"
                size="sm"
                onClick={() => handleValidateIssue(selectedIssue)}
                disabled={validating}
              >
                {validating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-1" />
                )}
                Validate with AI
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenInGitHub(selectedIssue.url)}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Open in GitHub
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIssue(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Issue Detail Content */}
          <div className="flex-1 overflow-auto p-6">
            {/* Title */}
            <h1 className="text-xl font-bold mb-2">{selectedIssue.title}</h1>

            {/* Meta info */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  selectedIssue.state === 'OPEN'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-purple-500/10 text-purple-500'
                )}
              >
                {selectedIssue.state === 'OPEN' ? 'Open' : 'Closed'}
              </span>
              <span>
                #{selectedIssue.number} opened {formatDate(selectedIssue.createdAt)} by{' '}
                <span className="font-medium text-foreground">{selectedIssue.author.login}</span>
              </span>
            </div>

            {/* Labels */}
            {selectedIssue.labels.length > 0 && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {selectedIssue.labels.map((label) => (
                  <span
                    key={label.name}
                    className="px-2 py-0.5 text-xs font-medium rounded-full"
                    style={{
                      backgroundColor: `#${label.color}20`,
                      color: `#${label.color}`,
                      border: `1px solid #${label.color}40`,
                    }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            )}

            {/* Assignees */}
            {selectedIssue.assignees && selectedIssue.assignees.length > 0 && (
              <div className="flex items-center gap-2 mb-4">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Assigned to:</span>
                <div className="flex items-center gap-2">
                  {selectedIssue.assignees.map((assignee) => (
                    <span
                      key={assignee.login}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20"
                    >
                      {assignee.avatarUrl && (
                        <img
                          src={assignee.avatarUrl}
                          alt={assignee.login}
                          className="h-4 w-4 rounded-full"
                        />
                      )}
                      {assignee.login}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Pull Requests */}
            {selectedIssue.linkedPRs && selectedIssue.linkedPRs.length > 0 && (
              <div className="mb-6 p-3 rounded-lg bg-muted/30 border border-border">
                <div className="flex items-center gap-2 mb-2">
                  <GitPullRequest className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Linked Pull Requests</span>
                </div>
                <div className="space-y-2">
                  {selectedIssue.linkedPRs.map((pr) => (
                    <div key={pr.number} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            'px-1.5 py-0.5 text-xs font-medium rounded',
                            pr.state === 'open'
                              ? 'bg-green-500/10 text-green-500'
                              : pr.state === 'merged'
                                ? 'bg-purple-500/10 text-purple-500'
                                : 'bg-red-500/10 text-red-500'
                          )}
                        >
                          {pr.state === 'open'
                            ? 'Open'
                            : pr.state === 'merged'
                              ? 'Merged'
                              : 'Closed'}
                        </span>
                        <span className="text-muted-foreground">#{pr.number}</span>
                        <span className="truncate">{pr.title}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 flex-shrink-0"
                        onClick={() => handleOpenInGitHub(pr.url)}
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Body */}
            {selectedIssue.body ? (
              <Markdown className="text-sm">{selectedIssue.body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description provided.</p>
            )}

            {/* Open in GitHub CTA */}
            <div className="mt-8 p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm text-muted-foreground mb-3">
                View comments, add reactions, and more on GitHub.
              </p>
              <Button onClick={() => handleOpenInGitHub(selectedIssue.url)}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View Full Issue on GitHub
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Dialog */}
      <ValidationDialog
        open={showValidationDialog}
        onOpenChange={setShowValidationDialog}
        issue={selectedIssue}
        validationResult={validationResult}
        isValidating={validating}
        onConvertToTask={handleConvertToTask}
      />
    </div>
  );
}

interface IssueRowProps {
  issue: GitHubIssue;
  isSelected: boolean;
  onClick: () => void;
  onOpenExternal: () => void;
  formatDate: (date: string) => string;
}

function IssueRow({ issue, isSelected, onClick, onOpenExternal, formatDate }: IssueRowProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 cursor-pointer hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent'
      )}
      onClick={onClick}
    >
      {issue.state === 'OPEN' ? (
        <Circle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{issue.title}</span>
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-muted-foreground">
            #{issue.number} opened {formatDate(issue.createdAt)} by {issue.author.login}
          </span>
        </div>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Labels */}
          {issue.labels.map((label) => (
            <span
              key={label.name}
              className="px-1.5 py-0.5 text-[10px] font-medium rounded-full"
              style={{
                backgroundColor: `#${label.color}20`,
                color: `#${label.color}`,
                border: `1px solid #${label.color}40`,
              }}
            >
              {label.name}
            </span>
          ))}

          {/* Linked PR indicator */}
          {issue.linkedPRs && issue.linkedPRs.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/20">
              <GitPullRequest className="h-3 w-3" />
              {issue.linkedPRs.length} PR{issue.linkedPRs.length > 1 ? 's' : ''}
            </span>
          )}

          {/* Assignee indicator */}
          {issue.assignees && issue.assignees.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
              <User className="h-3 w-3" />
              {issue.assignees.map((a) => a.login).join(', ')}
            </span>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="flex-shrink-0 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onOpenExternal();
        }}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
