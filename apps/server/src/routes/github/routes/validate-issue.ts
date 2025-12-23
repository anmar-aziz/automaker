/**
 * POST /validate-issue endpoint - Validate a GitHub issue using Claude SDK
 *
 * Scans the codebase to determine if an issue is valid, invalid, or needs clarification.
 */

import type { Request, Response } from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '@automaker/utils';
import type { IssueValidationResult } from '@automaker/types';
import { createSuggestionsOptions } from '../../../lib/sdk-options.js';
import {
  issueValidationSchema,
  ISSUE_VALIDATION_SYSTEM_PROMPT,
  buildValidationPrompt,
} from './validation-schema.js';
import { getErrorMessage, logError } from './common.js';

const logger = createLogger('IssueValidation');

/**
 * Request body for issue validation
 */
interface ValidateIssueRequestBody {
  projectPath: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  issueLabels?: string[];
}

/**
 * Creates the handler for validating GitHub issues against the codebase.
 *
 * Uses Claude SDK with:
 * - Read-only tools (Read, Glob, Grep) for codebase analysis
 * - JSON schema structured output for reliable parsing
 * - System prompt guiding the validation process
 */
export function createValidateIssueHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    // Declare timeoutId outside try block for proper cleanup
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const { projectPath, issueNumber, issueTitle, issueBody, issueLabels } =
        req.body as ValidateIssueRequestBody;

      // Validate required fields
      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      if (!issueNumber || typeof issueNumber !== 'number') {
        res
          .status(400)
          .json({ success: false, error: 'issueNumber is required and must be a number' });
        return;
      }

      if (!issueTitle || typeof issueTitle !== 'string') {
        res.status(400).json({ success: false, error: 'issueTitle is required' });
        return;
      }

      if (typeof issueBody !== 'string') {
        res.status(400).json({ success: false, error: 'issueBody must be a string' });
        return;
      }

      logger.info(`Validating issue #${issueNumber}: ${issueTitle}`);

      // Build the prompt
      const prompt = buildValidationPrompt(issueNumber, issueTitle, issueBody, issueLabels);

      // Create abort controller with 2 minute timeout for validation
      const abortController = new AbortController();
      const VALIDATION_TIMEOUT_MS = 360000; // 6 minutes
      timeoutId = setTimeout(() => {
        logger.warn(`Validation timeout reached after ${VALIDATION_TIMEOUT_MS}ms`);
        abortController.abort();
      }, VALIDATION_TIMEOUT_MS);

      // Create SDK options with structured output and abort controller
      const options = createSuggestionsOptions({
        cwd: projectPath,
        systemPrompt: ISSUE_VALIDATION_SYSTEM_PROMPT,
        abortController,
        outputFormat: {
          type: 'json_schema',
          schema: issueValidationSchema as Record<string, unknown>,
        },
      });

      // Execute the query
      const stream = query({ prompt, options });
      let validationResult: IssueValidationResult | null = null;
      let responseText = '';

      for await (const msg of stream) {
        // Collect assistant text for debugging/fallback
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              responseText += block.text;
            }
          }
        }

        // Extract structured output on success
        if (msg.type === 'result' && msg.subtype === 'success') {
          const resultMsg = msg as { structured_output?: IssueValidationResult };
          if (resultMsg.structured_output) {
            validationResult = resultMsg.structured_output;
            logger.debug('Received structured output:', validationResult);
          }
        }

        // Handle errors
        if (msg.type === 'result') {
          const resultMsg = msg as { subtype?: string };
          if (resultMsg.subtype === 'error_max_structured_output_retries') {
            logger.error('Failed to produce valid structured output after retries');
            throw new Error('Could not produce valid validation output');
          }
        }
      }

      // Require structured output - no fragile fallback parsing
      if (!validationResult) {
        logger.error('No structured output received from Claude SDK');
        logger.debug('Raw response text:', responseText);
        throw new Error('Validation failed: no structured output received');
      }

      // Clear the timeout since we completed successfully
      clearTimeout(timeoutId);

      logger.info(`Issue #${issueNumber} validation complete: ${validationResult.verdict}`);
      res.json({
        success: true,
        issueNumber,
        validation: validationResult,
      });
    } catch (error) {
      // Clear timeout on error as well (if it was set)
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      logError(error, `Issue validation failed`);
      logger.error('Issue validation error:', error);

      // Check if response already sent
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: getErrorMessage(error),
        });
      }
    }
  };
}
