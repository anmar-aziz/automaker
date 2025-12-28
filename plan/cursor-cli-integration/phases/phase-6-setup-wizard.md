# Phase 6: UI Setup Wizard

**Status:** `completed`
**Dependencies:** Phase 4 (Routes)
**Estimated Effort:** Medium (React component)

---

## Objective

Add an optional Cursor CLI setup step to the welcome wizard, allowing users to configure Cursor as an AI provider during initial setup.

---

## Tasks

### Task 6.1: Create Cursor Setup Step Component

**Status:** `completed`

**File:** `apps/ui/src/components/views/setup-view/steps/cursor-setup-step.tsx`

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, Loader2, ExternalLink, Terminal, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { api } from '@/lib/http-api-client';

interface CursorSetupStepProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface CliStatus {
  installed: boolean;
  version?: string;
  path?: string;
  auth?: {
    authenticated: boolean;
    method: string;
  };
  installCommand?: string;
  loginCommand?: string;
}

export function CursorSetupStep({ onComplete, onSkip }: CursorSetupStepProps) {
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const result = await api.setup.getCursorStatus();

      if (result.success) {
        setStatus({
          installed: result.installed ?? false,
          version: result.version,
          path: result.path,
          auth: result.auth,
          installCommand: result.installCommand,
          loginCommand: result.loginCommand,
        });

        if (result.auth?.authenticated) {
          toast.success('Cursor CLI is ready!');
        }
      } else {
        toast.error('Failed to check Cursor status');
      }
    } catch (error) {
      console.error('Failed to check Cursor status:', error);
      toast.error('Failed to check Cursor CLI status');
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleLogin = async () => {
    setIsLoggingIn(true);

    try {
      // Copy login command to clipboard and show instructions
      if (status?.loginCommand) {
        await navigator.clipboard.writeText(status.loginCommand);
        toast.info('Login command copied! Paste in terminal to authenticate.');
      }

      // Poll for auth status
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes with 2s interval

      const pollInterval = setInterval(async () => {
        attempts++;

        try {
          const result = await api.setup.getCursorStatus();

          if (result.auth?.authenticated) {
            clearInterval(pollInterval);
            setStatus((prev) => (prev ? { ...prev, auth: result.auth } : null));
            setIsLoggingIn(false);
            toast.success('Successfully logged in to Cursor!');
          }
        } catch {
          // Ignore polling errors
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setIsLoggingIn(false);
          toast.error('Login timed out. Please try again.');
        }
      }, 2000);
    } catch (error) {
      console.error('Login failed:', error);
      toast.error('Failed to start login process');
      setIsLoggingIn(false);
    }
  };

  const handleCopyInstallCommand = async () => {
    if (status?.installCommand) {
      await navigator.clipboard.writeText(status.installCommand);
      toast.success('Install command copied to clipboard!');
    }
  };

  const isComplete = status?.installed && status?.auth?.authenticated;

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Terminal className="w-5 h-5" />
          Cursor CLI Setup
          <Badge variant="outline" className="ml-2">
            Optional
          </Badge>
        </CardTitle>
        <CardDescription>
          Configure Cursor CLI as an alternative AI provider. You can skip this and use Claude
          instead, or configure it later in Settings.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Installation Status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">CLI Installation</span>
            {isChecking ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : status?.installed ? (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs">v{status.version}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <XCircle className="w-4 h-4" />
                <span className="text-xs">Not installed</span>
              </div>
            )}
          </div>

          {!status?.installed && !isChecking && (
            <Alert>
              <AlertDescription className="text-sm space-y-3">
                <p>Install Cursor CLI to use Cursor models:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted p-2 rounded text-xs font-mono overflow-x-auto">
                    {status?.installCommand || 'curl https://cursor.com/install -fsS | bash'}
                  </code>
                  <Button variant="outline" size="sm" onClick={handleCopyInstallCommand}>
                    Copy
                  </Button>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto"
                  onClick={() => window.open('https://cursor.com/docs/cli', '_blank')}
                >
                  View installation docs
                  <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Authentication Status */}
        {status?.installed && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Authentication</span>
              {status.auth?.authenticated ? (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-xs capitalize">
                    {status.auth.method === 'api_key' ? 'API Key' : 'Browser Login'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <XCircle className="w-4 h-4" />
                  <span className="text-xs">Not authenticated</span>
                </div>
              )}
            </div>

            {!status.auth?.authenticated && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Run the login command in your terminal, then complete authentication in your
                  browser:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted p-2 rounded text-xs font-mono">
                    {status.loginCommand || 'cursor-agent login'}
                  </code>
                </div>
                <Button onClick={handleLogin} disabled={isLoggingIn} className="w-full">
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Waiting for login...
                    </>
                  ) : (
                    'Copy Command & Wait for Login'
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onSkip} className="flex-1">
            Skip for now
          </Button>
          <Button
            onClick={onComplete}
            disabled={!isComplete && status?.installed}
            className="flex-1"
          >
            {isComplete ? 'Continue' : 'Complete setup to continue'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={checkStatus}
            disabled={isChecking}
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Info note */}
        <p className="text-xs text-muted-foreground text-center">
          You can always configure Cursor later in Settings → Providers
        </p>
      </CardContent>
    </Card>
  );
}

export default CursorSetupStep;
```

### Task 6.2: Update Setup View Steps

**Status:** `completed`

**File:** `apps/ui/src/components/views/setup-view.tsx`

Add the Cursor step to the wizard:

```tsx
import { CursorSetupStep } from './setup-view/steps/cursor-setup-step';

// Add to steps configuration
const SETUP_STEPS = [
  // Existing steps...
  {
    id: 'claude',
    title: 'Claude CLI',
    optional: false,
    component: ClaudeSetupStep,
  },
  // Add Cursor step
  {
    id: 'cursor',
    title: 'Cursor CLI',
    optional: true,
    component: CursorSetupStep,
  },
  // Remaining steps...
  {
    id: 'project',
    title: 'Project',
    optional: false,
    component: ProjectSetupStep,
  },
];

// In the render function, handle optional steps:
function SetupView() {
  const [currentStep, setCurrentStep] = useState(0);
  const [skippedSteps, setSkippedSteps] = useState<Set<string>>(new Set());

  const handleSkip = (stepId: string) => {
    setSkippedSteps((prev) => new Set([...prev, stepId]));
    setCurrentStep((prev) => prev + 1);
  };

  const handleComplete = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const step = SETUP_STEPS[currentStep];
  const StepComponent = step.component;

  return (
    <div className="setup-view">
      {/* Progress indicator */}
      <div className="flex gap-2 mb-6">
        {SETUP_STEPS.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              'flex-1 h-2 rounded',
              i < currentStep
                ? 'bg-green-500'
                : i === currentStep
                  ? 'bg-blue-500'
                  : skippedSteps.has(s.id)
                    ? 'bg-gray-300'
                    : 'bg-gray-200'
            )}
          />
        ))}
      </div>

      {/* Step title */}
      <h2 className="text-xl font-semibold mb-4">
        {step.title}
        {step.optional && <span className="text-sm text-muted-foreground ml-2">(Optional)</span>}
      </h2>

      {/* Step component */}
      <StepComponent onComplete={handleComplete} onSkip={() => handleSkip(step.id)} />
    </div>
  );
}
```

### Task 6.3: Add Step Indicator for Optional Steps

**Status:** `completed`

Add visual indicator for optional vs required steps in the progress bar.

---

## Verification

### Test 1: Component Rendering

1. Start the app with a fresh setup (or clear setup state)
2. Navigate through setup steps
3. Verify Cursor step appears after Claude step
4. Verify "Optional" badge is displayed

### Test 2: Skip Functionality

1. Click "Skip for now" on Cursor step
2. Verify step is skipped and progress continues
3. Verify skipped state is persisted (if applicable)

### Test 3: Installation Detection

1. With cursor-agent NOT installed:
   - Should show "Not installed" status
   - Should show install command
   - Continue button should be disabled

2. With cursor-agent installed but not authenticated:
   - Should show version number
   - Should show "Not authenticated" status
   - Should show login instructions

3. With cursor-agent installed and authenticated:
   - Should show green checkmarks
   - Continue button should be enabled

### Test 4: Login Flow

1. Click "Copy Command & Wait for Login"
2. Verify command is copied to clipboard
3. Run login command in terminal
4. Verify status updates after authentication
5. Verify success toast appears

### Test 5: Refresh Status

1. Click refresh button
2. Verify loading state is shown
3. Verify status is re-fetched

---

## Verification Checklist

Before marking this phase complete:

- [ ] CursorSetupStep component renders correctly
- [ ] Step appears in setup wizard flow
- [ ] Skip button works and progresses to next step
- [ ] Installation status is correctly detected
- [ ] Authentication status is correctly detected
- [ ] Login command copy works
- [ ] Polling for auth status works
- [ ] Refresh button updates status
- [ ] Error states handled gracefully
- [ ] Progress indicator shows optional step differently

---

## Files Changed

| File                                                                  | Action | Description          |
| --------------------------------------------------------------------- | ------ | -------------------- |
| `apps/ui/src/components/views/setup-view/steps/cursor-setup-step.tsx` | Create | Setup step component |
| `apps/ui/src/components/views/setup-view.tsx`                         | Modify | Add step to wizard   |

---

## Design Notes

- The step is marked as optional with a badge
- Skip button is always available for optional steps
- The login flow is asynchronous with polling
- Status can be manually refreshed
- Error states show clear recovery instructions
