/**
 * Claude Provider - Executes queries using Claude Agent SDK
 *
 * Wraps the @anthropic-ai/claude-agent-sdk for seamless integration
 * with the provider architecture.
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider } from './base-provider.js';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';

export class ClaudeProvider extends BaseProvider {
  getName(): string {
    return 'claude';
  }

  /**
   * Execute a query using Claude Agent SDK
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    console.log('[ClaudeProvider] executeQuery() called');

    const {
      prompt,
      model,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory,
      sdkSessionId,
    } = options;

    console.log('[ClaudeProvider] Options:', {
      model,
      cwd,
      maxTurns,
      promptType: typeof prompt,
      promptLength: typeof prompt === 'string' ? prompt.length : 'array',
      hasSystemPrompt: !!systemPrompt,
      systemPromptLength: systemPrompt?.length,
      hasConversationHistory: !!conversationHistory?.length,
      conversationHistoryLength: conversationHistory?.length || 0,
      sdkSessionId,
      allowedToolsCount: allowedTools?.length,
    });

    // Build Claude SDK options
    const defaultTools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'];
    const toolsToUse = allowedTools || defaultTools;

    const sdkOptions: Options = {
      model,
      systemPrompt,
      maxTurns,
      cwd,
      allowedTools: toolsToUse,
      permissionMode: 'default',
      abortController,
      // Resume existing SDK session if we have a session ID
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
      // Forward settingSources for CLAUDE.md file loading
      ...(options.settingSources && { settingSources: options.settingSources }),
    };

    console.log('[ClaudeProvider] SDK options prepared:', {
      model: sdkOptions.model,
      maxTurns: sdkOptions.maxTurns,
      permissionMode: sdkOptions.permissionMode,
      sandboxEnabled: sdkOptions.sandbox?.enabled || false,
      hasResume: !!(sdkOptions as any).resume,
      toolsCount: sdkOptions.allowedTools?.length,
    });

    // Build prompt payload
    let promptPayload: string | AsyncIterable<any>;

    if (Array.isArray(prompt)) {
      // Multi-part prompt (with images)
      promptPayload = (async function* () {
        const multiPartPrompt = {
          type: 'user' as const,
          session_id: '',
          message: {
            role: 'user' as const,
            content: prompt,
          },
          parent_tool_use_id: null,
        };
        yield multiPartPrompt;
      })();
    } else {
      // Simple text prompt
      promptPayload = prompt;
    }

    // Execute via Claude Agent SDK
    try {
      console.log('[ClaudeProvider] ANTHROPIC_API_KEY exists:', !!process.env.ANTHROPIC_API_KEY);
      console.log(
        '[ClaudeProvider] ANTHROPIC_API_KEY length:',
        process.env.ANTHROPIC_API_KEY?.length || 0
      );
      console.log('[ClaudeProvider] HOME directory:', process.env.HOME);
      console.log('[ClaudeProvider] User:', process.env.USER);
      console.log('[ClaudeProvider] Current working directory:', process.cwd());

      // CRITICAL DEBUG: Log exact SDK options being passed
      console.log('[ClaudeProvider] EXACT sdkOptions being passed to query():');
      console.log(
        JSON.stringify(
          {
            model: sdkOptions.model,
            maxTurns: sdkOptions.maxTurns,
            cwd: sdkOptions.cwd,
            allowedTools: sdkOptions.allowedTools,
            permissionMode: sdkOptions.permissionMode,
            hasSandbox: !!sdkOptions.sandbox,
            hasAbortController: !!sdkOptions.abortController,
            hasResume: !!(sdkOptions as any).resume,
            hasSettingSources: !!sdkOptions.settingSources,
            settingSources: sdkOptions.settingSources,
          },
          null,
          2
        )
      );

      console.log('[ClaudeProvider] Calling Claude Agent SDK query()...');
      console.log(
        '[ClaudeProvider] About to call query() with prompt payload type:',
        typeof promptPayload
      );

      const stream = query({ prompt: promptPayload, options: sdkOptions });
      console.log('[ClaudeProvider] query() call returned, stream object type:', typeof stream);

      console.log('[ClaudeProvider] SDK query() returned stream, starting iteration...');
      let streamMessageCount = 0;

      // Add a watchdog timer to detect if stream is hanging
      let lastMessageTime = Date.now();
      const watchdogInterval = setInterval(() => {
        const timeSinceLastMessage = Date.now() - lastMessageTime;
        if (timeSinceLastMessage > 10000) {
          console.log(
            `[ClaudeProvider] WARNING: No messages received for ${Math.floor(timeSinceLastMessage / 1000)}s`
          );
        }
      }, 5000);

      try {
        // Stream messages directly - they're already in the correct format
        for await (const msg of stream) {
          lastMessageTime = Date.now();
          streamMessageCount++;
          console.log(`[ClaudeProvider] Stream message #${streamMessageCount}:`, {
            type: msg.type,
            subtype: (msg as any).subtype,
            hasMessage: !!(msg as any).message,
            hasResult: !!(msg as any).result,
            session_id: msg.session_id,
          });
          yield msg as ProviderMessage;
        }
      } finally {
        clearInterval(watchdogInterval);
      }

      console.log(
        '[ClaudeProvider] Stream iteration completed, total messages:',
        streamMessageCount
      );
    } catch (error) {
      console.error('[ClaudeProvider] ERROR: executeQuery() error during execution:', error);
      console.error('[ClaudeProvider] ERROR stack:', (error as Error).stack);
      throw error;
    }
  }

  /**
   * Detect Claude SDK installation (always available via npm)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    // Claude SDK is always available since it's a dependency
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    const status: InstallationStatus = {
      installed: true,
      method: 'sdk',
      hasApiKey,
      authenticated: hasApiKey,
    };

    return status;
  }

  /**
   * Get available Claude models
   */
  getAvailableModels(): ModelDefinition[] {
    const models = [
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        modelString: 'claude-opus-4-5-20251101',
        provider: 'anthropic',
        description: 'Most capable Claude model',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
        default: true,
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        modelString: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        description: 'Balanced performance and cost',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        modelString: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        description: 'Fast and capable',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        modelString: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        description: 'Fastest Claude model',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'basic' as const,
      },
    ] satisfies ModelDefinition[];
    return models;
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision', 'thinking'];
    return supportedFeatures.includes(feature);
  }
}
