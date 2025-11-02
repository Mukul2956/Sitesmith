import { Step, StepType } from './types';

export class StreamingXMLParser {
  private buffer: string = '';
  private stepId: number = 1;
  private onStepFound: (step: Step) => void;
  private processedActionCount: number = 0;
  private artifactFound: boolean = false;

  constructor(onStepFound: (step: Step) => void, initialStepId: number = 1) {
    this.onStepFound = onStepFound;
    this.stepId = initialStepId;
  }

  /**
   * Process a chunk of streaming text and extract any complete steps
   */
  processChunk(chunk: string): void {
    this.buffer += chunk;
    
    // Check for artifact title first (only once)
    if (!this.artifactFound) {
      this.checkForArtifact();
    }
    
    // Extract and process complete boltAction elements
    this.extractCompleteActions();
  }

  /**
   * Process any remaining content when streaming is complete
   */
  finalize(): void {
    // Try to extract any remaining complete actions
    this.extractCompleteActions();
    
    console.log(`🎯 Streaming parse complete: ${this.processedActionCount} actions processed`);
  }

  private checkForArtifact(): void {
    const titleMatch = this.buffer.match(/<boltArtifact[^>]*title="([^"]*)"/);
    if (titleMatch) {
      const artifactTitle = titleMatch[1];
      console.log(`🎨 Found artifact: "${artifactTitle}"`);
      
      // Add initial artifact step (like steps.ts does)
      this.onStepFound({
        id: this.stepId++,
        title: artifactTitle,
        description: '',
        type: StepType.CreateFolder,
        status: 'pending'
      });
      
      this.artifactFound = true;
    }
  }

  private extractCompleteActions(): void {
    // Use the EXACT same regex as steps.ts
    const actionRegex = /<boltAction\s+type="([^"]*)"(?:\s+filePath="([^"]*)")?>([\s\S]*?)<\/boltAction>/g;
    
    let match;
    let newActionsFound = 0;
    let startPosition = 0;
    
    // Find all complete actions in buffer
    while ((match = actionRegex.exec(this.buffer)) !== null) {
      const [fullMatch, type, filePath, content] = match;
      
      // Skip if we already processed this action (prevent duplicates)
      if (match.index < startPosition) {
        continue;
      }
      
      newActionsFound++;
      this.processedActionCount++;
      
      console.log(`📦 Processing action #${this.processedActionCount}: type="${type}", filePath="${filePath || 'N/A'}"`);
      console.log(`  - Content length: ${content.length}`);
      
      // Process exactly like steps.ts
      if (type === 'file') {
        // Validate syntax for JS/TS files
        if (filePath && (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.ts') || filePath.endsWith('.tsx'))) {
          const syntaxIssues = this.validateJavaScriptSyntax(content.trim());
          if (syntaxIssues.length > 0) {
            console.warn(`⚠️ Syntax issues detected in ${filePath}:`, syntaxIssues);
            // Still process the file but log warnings
          }
        }
        
        const step: Step = {
          id: this.stepId++,
          title: `Create ${filePath || 'file'}`,
          description: '',
          type: StepType.CreateFile,
          status: 'pending',
          code: content.trim(), // Use trim() like steps.ts
          path: filePath
        };
        
        console.log(`✅ Emitting file step: ${filePath}`);
        this.onStepFound(step);
        
      } else if (type === 'shell') {
        const step: Step = {
          id: this.stepId++,
          title: 'Run command',
          description: '',
          type: StepType.RunScript,
          status: 'pending',
          code: content.trim() // Use trim() like steps.ts
        };
        
        console.log(`✅ Emitting shell step`);
        this.onStepFound(step);
      }
      
      // Update start position to avoid reprocessing
      startPosition = match.index + fullMatch.length;
    }
    
    if (newActionsFound > 0) {
      console.log(`📋 Found ${newActionsFound} new complete actions`);
      
      // Remove processed content from buffer to prevent memory buildup
      // Keep only unprocessed content
      if (startPosition > 0) {
        this.buffer = this.buffer.substring(startPosition);
      }
    }
  }

  private validateJavaScriptSyntax(code: string): string[] {
    const issues: string[] = [];
    
    // Common syntax patterns that indicate errors
    const patterns = [
      // Malformed setTimeout (like "1500);" instead of ")}, 1500);")
      { regex: /,\s*\d+\s*\)\s*;/, message: "Malformed setTimeout - check closing brackets" },
      // Unclosed brackets
      { regex: /\{[^}]*$/, message: "Possibly unclosed opening bracket" },
      { regex: /\([^)]*$/, message: "Possibly unclosed opening parenthesis" },
      // Invalid identifiers starting with numbers
      { regex: /\b\d+[a-zA-Z]/, message: "Invalid identifier starting with number" },
      // Malformed JSX attributes
      { regex: /{[^}]*"[^"]*$/, message: "Possibly malformed JSX attribute" },
    ];
    
    patterns.forEach(pattern => {
      if (pattern.regex.test(code)) {
        issues.push(pattern.message);
      }
    });
    
    return issues;
  }
}

/**
 * Enhanced streaming-capable XML parser that can process incomplete responses
 */
export function parseXmlStream(response: string, onStepFound?: (step: Step) => void): Step[] {
  const steps: Step[] = [];
  
  const parser = new StreamingXMLParser((step) => {
    steps.push(step);
    if (onStepFound) {
      onStepFound(step);
    }
  });
  
  parser.processChunk(response);
  parser.finalize();
  
  return steps;
}

/**
 * Legacy parser for backward compatibility
 */
export function parseXml(response: string): Step[] {
  return parseXmlStream(response);
}