
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getSystemPrompt, BASE_PROMPT, SIMPLE_SYSTEM_PROMPT } from "./prompts.js";
import type { TextBlock } from "@anthropic-ai/sdk/resources";
import { basePrompt as nodebasePrompt } from "./default/node.js";
import { basePrompt as reactbasePrompt } from "./default/react.js";
import { connectDatabase } from "./config/database.js";
import projectRoutes from "./routes/projects.js";

dotenv.config();

// Function to combine React and Node templates for fullstack projects
function combineTemplates(reactTemplate: string, nodeTemplate: string): string {
    // Extract the React template content
    const reactContent = reactTemplate.replace('<boltArtifact id="project-import" title="Project Files">', '')
                                    .replace('</boltArtifact>', '');
    
    // Extract the Node template content  
    const nodeContent = nodeTemplate.replace('<boltArtifact id="project-import" title="Project Files">', '')
                                  .replace('</boltArtifact>', '');
    
    // Combine both templates with proper structure for fullstack
    return `<boltArtifact id="project-import" title="Project Files">
${reactContent}
${nodeContent}

<boltAction type="file" filePath="README.md"># Fullstack Application

This is a fullstack application with React frontend and Node.js backend.

## Project Structure

\`\`\`
├── frontend/          # React + TypeScript + Vite
├── backend/           # Node.js + Express
└── README.md
\`\`\`

## Getting Started

### Backend Setup
\`\`\`bash
cd backend
npm install
npm run dev
\`\`\`

### Frontend Setup  
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

## Features

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Express + CORS
- **Communication**: API integration between frontend and backend
- **Hot Reload**: Both frontend and backend support hot reloading

## Development

The frontend and backend can be developed independently and integrated via API calls.
</boltAction>

</boltArtifact>`;
}



const app = express();

// Initialize AI clients
const anthropic = new Anthropic({
  timeout: 600000, // 10 minutes timeout
  maxRetries: 3
});
const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
  timeout: 600000, // 10 minutes timeout (increased from 60 seconds)
  maxRetries: 3, // Increased retry attempts
});

// AI Provider: 'nvidia' (default, free) or 'claude' (premium)
const AI_PROVIDER = process.env.AI_PROVIDER || 'nvidia';

// Connect to MongoDB
connectDatabase();

app.use(cors());
// Increase body parser limits for large conversation histories and projects
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Routes
app.use('/api/projects', projectRoutes);

// Decide between node or react template
app.post("/template", async (req, res) => {
    const prompt = req.body.prompt;
    const provider = req.body.provider || AI_PROVIDER;
    try {
        let answer: string;
        let templatePrompts: string[] = [];
        let uiPrompts: string[] = [];
    // let chatResponse: string | null = null;
    // let basePrompt = BASE_PROMPT;
    // let systemPrompt = "";
    // let userPrompt = "";
    // let chatMessages: any[] = [];

        // 1. Decide template type
        if (provider === "claude") {
            const response = await anthropic.messages.create({
                messages: [{ role: "user", content: prompt }],
                model: "claude-sonnet-4-5",
                max_tokens: 200,
                system:
                    "Analyze the project requirements and return one of these options: 'react' (frontend only), 'node' (backend/API only), or 'fullstack' (both frontend and backend). Consider if the project needs both a user interface AND an API/backend. Only return a single word: 'react', 'node', or 'fullstack'. Do not return anything extra",
            });
            answer = (response.content[0] as TextBlock).text.trim().toLowerCase();
        } else {
            try {
                const response = await openai.chat.completions.create({
                    model: "qwen/qwen3-coder-480b-a35b-instruct",
                    messages: [
                        {
                            role: "system",
                            content:
                                "Analyze the project requirements and return one of these options: 'react' (frontend only), 'node' (backend/API only), or 'fullstack' (both frontend and backend). Consider if the project needs both a user interface AND an API/backend. Only return a single word: 'react', 'node', or 'fullstack'. Do not return anything extra",
                        },
                        { role: "user", content: prompt },
                    ],
                    temperature: 0.7,
                    top_p: 0.8,
                    max_tokens: 200,
                });
                answer = (response.choices[0]?.message?.content || "react").trim().toLowerCase();
            } catch (nvidiaError) {
                // Smart fallback based on prompt content
                const promptLower = prompt.toLowerCase();
                
                // Check for fullstack indicators
                const hasBackendKeywords = promptLower.includes('api') || promptLower.includes('backend') || 
                                         promptLower.includes('server') || promptLower.includes('database') || 
                                         promptLower.includes('auth') || promptLower.includes('login') ||
                                         promptLower.includes('express') || promptLower.includes('node');
                
                const hasFrontendKeywords = promptLower.includes('frontend') || promptLower.includes('ui') || 
                                          promptLower.includes('interface') || promptLower.includes('website') || 
                                          promptLower.includes('app') || promptLower.includes('react') ||
                                          promptLower.includes('component') || promptLower.includes('page');
                
                const hasFullstackKeywords = promptLower.includes('fullstack') || promptLower.includes('full stack') ||
                                           promptLower.includes('full-stack') || promptLower.includes('web app') ||
                                           promptLower.includes('web application');
                
                if (hasFullstackKeywords || (hasBackendKeywords && hasFrontendKeywords)) {
                    answer = "fullstack";
                } else if (hasBackendKeywords) {
                    answer = "node";
                } else {
                    answer = "react";
                }
            }
        }

        // 2. Prepare template prompts only (no chat logic)
        if (answer.includes("react") && !answer.includes("fullstack")) {
            templatePrompts = [
                BASE_PROMPT,
                `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactbasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
            ];
            uiPrompts = [reactbasePrompt];
        } else if (answer.includes("node") && !answer.includes("fullstack")) {
            templatePrompts = [
                `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${nodebasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
            ];
            uiPrompts = [nodebasePrompt];
        } else if (answer.includes("fullstack")) {
            // Automatically combine React and Node templates for fullstack projects
            const combinedPrompt = reactbasePrompt + '\n\n' + nodebasePrompt;
            templatePrompts = [
                BASE_PROMPT,
                `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${combinedPrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n  - */package-lock.json\n  - */node_modules/\n`,
            ];
            uiPrompts = [combinedPrompt];
        } else {
            // Default to react if unclear
            templatePrompts = [
                BASE_PROMPT,
                `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactbasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
            ];
            uiPrompts = [reactbasePrompt];
        }

        // 3. Return only template result (no chat)
        res.json({
            prompts: templatePrompts,
            uiprompts: uiPrompts,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ message: "Error processing request", error: errorMessage });
    }
});


// Chat and code modification endpoint
app.post("/chat", async (req, res) => {
    let messages = req.body.messages;
    const provider = req.body.provider || AI_PROVIDER;
    let useStreaming = req.body.stream || false;
    // Force streaming for NVIDIA
    if (provider === "nvidia") {
        useStreaming = true;
    }
    console.log("[CHAT ENDPOINT CALLED]");
    console.log("Provider:", provider);
    console.log("Messages:", JSON.stringify(messages, null, 2));
    console.log("Streaming:", useStreaming);

    // --- Inject react/node/fullstack base prompt for NVIDIA ---
    if (provider === "nvidia") {
        // Try to infer project type from the latest user message or existing conversation
        let projectType = "react"; // default
        const conversationText = messages.map((m: any) => m.content).join(" ").toLowerCase();
        
        // Enhanced project type detection
        if (conversationText.includes("fullstack") || 
            (conversationText.includes("backend") && conversationText.includes("frontend")) ||
            (conversationText.includes("api") && conversationText.includes("react")) ||
            (conversationText.includes("server") && conversationText.includes("client"))) {
            projectType = "fullstack";
        } else if (conversationText.includes("node") || conversationText.includes("backend") || 
                   conversationText.includes("api") || conversationText.includes("server")) {
            projectType = "node";
        }
        
        // Import base prompts
        const { basePrompt: reactbasePrompt } = await import("./default/react.js");
        const { basePrompt: nodebasePrompt } = await import("./default/node.js");
        
        let basePrompt;
        if (projectType === "fullstack") {
            // Combine React and Node templates for fullstack projects
            basePrompt = combineTemplates(reactbasePrompt, nodebasePrompt);
        } else if (projectType === "node") {
            basePrompt = nodebasePrompt;
        } else {
            basePrompt = reactbasePrompt;
        }
        // Prepend as a system message
        messages = [
            { role: "system", content: basePrompt },
            ...messages
        ];
        console.log(`[CHAT] Injected ${projectType} base prompt as system message.`);
    }
    try {
        if (provider === "claude") {
            const response = await anthropic.messages.create({
                messages,
                model: "claude-sonnet-4-5",
                max_tokens: 16384, // Increased from 8000 to 16384 tokens for larger projects
                system: getSystemPrompt(),
            });
            const responseText = (response.content[0] as TextBlock)?.text;
            res.json({ response: responseText });
        } else {
            const systemPrompt = getSystemPrompt();
            const formattedMessages = [
                { role: "system" as const, content: systemPrompt },
                ...messages.map((msg: any) => ({
                    role: msg.role as "user" | "assistant",
                    content: msg.content,
                })),
            ];
            try {
                if (useStreaming && req.body.realTimeStream) {
                    // Improved real-time streaming response with proper error handling
                    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                    res.setHeader('Transfer-Encoding', 'chunked');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');

                    let hasResponded = false;
                    let lastChunkTime = Date.now();
                    
                    // Heartbeat mechanism to prevent connection drops
                    const heartbeatInterval = setInterval(() => {
                        const now = Date.now();
                        if (now - lastChunkTime > 30000 && !res.destroyed) { // 30 seconds
                            try {
                                res.write('\n'); // Send newline as heartbeat
                                lastChunkTime = now;
                            } catch (heartbeatError) {
                                console.error('Heartbeat error:', heartbeatError);
                                clearInterval(heartbeatInterval);
                            }
                        }
                    }, 10000); // Check every 10 seconds

                    try {
                        const completion = await openai.chat.completions.create({
                            model: "qwen/qwen3-coder-480b-a35b-instruct",
                            messages: formattedMessages,
                            temperature: 0.7,
                            top_p: 0.8,
                            max_tokens: 64000, // Increased to 64K for larger projects with multiple components
                            stream: true
                        });

                        let totalChunks = 0;
                        let totalChars = 0;
                        
                        for await (const chunk of completion) {
                            if (res.destroyed) {
                                console.log('❌ Client disconnected, stopping stream');
                                console.log(`  - Streamed ${totalChunks} chunks, ${totalChars} characters before disconnect`);
                                break;
                            }
                            
                            const delta = chunk.choices[0]?.delta;
                            if (delta?.content) {
                                try {
                                    res.write(delta.content);
                                    hasResponded = true;
                                    lastChunkTime = Date.now();
                                    totalChunks++;
                                    totalChars += delta.content.length;
                                } catch (writeError) {
                                    console.error('❌ Error writing chunk:', writeError);
                                    break;
                                }
                            }
                            
                            // Check for finish_reason
                            if (chunk.choices[0]?.finish_reason) {
                                console.log('🏁 Stream finished with reason:', chunk.choices[0].finish_reason);
                                if (chunk.choices[0].finish_reason === 'length') {
                                    console.log('⚠️ WARNING: Response was truncated due to max_tokens limit!');
                                }
                            }
                        }
                        
                        console.log('✅ Streaming completed');
                        console.log(`  - Total chunks: ${totalChunks}`);
                        console.log(`  - Total characters: ${totalChars}`);
                        
                        clearInterval(heartbeatInterval);
                        
                        if (!res.destroyed) {
                            res.end();
                        }
                    } catch (streamError) {
                        clearInterval(heartbeatInterval);
                        console.error('Streaming error:', streamError);
                        if (!hasResponded && !res.destroyed) {
                            res.status(500).json({ 
                                error: 'Streaming failed', 
                                message: streamError instanceof Error ? streamError.message : 'Unknown streaming error'
                            });
                        }
                    }
                } else if (useStreaming) {
                    // Collect full response before sending (current behavior)
                    const completion = await openai.chat.completions.create({
                        model: "qwen/qwen3-coder-480b-a35b-instruct",
                        messages: formattedMessages,
                        temperature: 0.7,
                        top_p: 0.8,
                        max_tokens: 64000, // Increased to 64K for larger projects
                        stream: true
                    });
                    let fullResponse = "";
                    for await (const chunk of completion) {
                        const delta = chunk.choices[0]?.delta;
                        if (delta?.content) {
                            fullResponse += delta.content;
                        }
                    }
                    res.json({ response: fullResponse });
                } else {
                    const response = await openai.chat.completions.create({
                        model: "qwen/qwen3-coder-480b-a35b-instruct",
                        messages: formattedMessages,
                        temperature: 0.7,
                        top_p: 0.8,
                        max_tokens: 64000 // Increased to 64K for larger projects
                    });
                    const responseContent = response.choices[0]?.message?.content || "";
                    res.json({ response: responseContent });
                }
            } catch (nvidiaError) {
                if (
                    nvidiaError instanceof Error &&
                    (nvidiaError.message.includes("timeout") ||
                        nvidiaError.message.includes("timed out"))
                ) {
                    res.status(504).json({
                        message:
                            "Request timeout - NVIDIA API is taking too long to respond. Try again or switch to Claude.",
                        error: "Timeout",
                        suggestion: "Switch to Claude provider for more reliable responses",
                    });
                } else {
                    res.status(500).json({
                        message: "NVIDIA API error",
                        error: nvidiaError instanceof Error ? nvidiaError.message : "Unknown error",
                        suggestion: "Try switching to Claude provider",
                    });
                }
                return;
            }
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ message: "Error processing chat request", error: errorMessage });
    }
});
// app.post("/chat",async (req,res)=>{
//     const messages=req.body.messages;
//     console.log('Chat request received with', messages.length, 'messages');
    
//     try {
//         const response = await anthropic.messages.create({
//             messages: messages,
//             model: "claude-sonnet-4-5",
//             max_tokens: 12000,
//             system: getSystemPrompt()
//         });
        
//         console.log('Chat response received');
//         res.json({
//             response: (response.content[0] as TextBlock)?.text
//         });
//     } catch (error) {
//         console.error('Error in chat endpoint:', error);
//         const errorMessage = error instanceof Error ? error.message : 'Unknown error';
//         res.status(500).json({ message: "Error processing chat request", error: errorMessage });
//     }
// });
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`📍 Server URL: http://localhost:${PORT}`);
    console.log(`🔗 CORS enabled for all origins`);
    console.log(`🤖 AI Provider: ${AI_PROVIDER}`);
});

// async function main(){
//     anthropic.messages.stream({
//     messages: [{
//         role: 'user', content: "For all designs I ask you to make, have them be beautiful, not cookie cutter. Make webpages that are fully featured and worthy for production.\n\nBy default, this template supports JSX syntax with Tailwind CSS classes, React hooks, and Lucide React for icons. Do not install other packages for UI themes, icons, etc unless absolutely necessary or I request them.\n\nUse icons from lucide-react for logos.\n"
//         },{
//             role:'user',content:""
//         },{
//             role:'user',content:"create todo"
//         }],
//     model: 'claude-opus-4-1-20250805',
//     max_tokens: 1024,
//     system:getSystemPrompt()
// }).on('text', (text) => {
//     console.log(text);
// });
// }
// main()


