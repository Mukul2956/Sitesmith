
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getSystemPrompt, BASE_PROMPT, SIMPLE_SYSTEM_PROMPT } from "./prompts.js";
import type { TextBlock } from "@anthropic-ai/sdk/resources";
import { basePrompt as nodebasePrompt } from "./default/node.js";
import { basePrompt as reactbasePrompt } from "./default/react.js";

dotenv.config();



const app = express();

// Initialize AI clients
const anthropic = new Anthropic();
const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
  timeout: 60000, // 60 seconds timeout
  maxRetries: 2, // Retry failed requests up to 2 times
});

// AI Provider: 'nvidia' (default, free) or 'claude' (premium)
const AI_PROVIDER = process.env.AI_PROVIDER || 'nvidia';


app.use(cors());
app.use(express.json());

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
                    "Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra",
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
                                "Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra",
                        },
                        { role: "user", content: prompt },
                    ],
                    temperature: 0.7,
                    top_p: 0.8,
                    max_tokens: 200,
                });
                answer = (response.choices[0]?.message?.content || "react").trim().toLowerCase();
            } catch (nvidiaError) {
                answer = "react";
            }
        }

        // 2. Prepare template prompts only (no chat logic)
        if (answer.includes("react")) {
            templatePrompts = [
                BASE_PROMPT,
                `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactbasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
            ];
            uiPrompts = [reactbasePrompt];
        } else if (answer.includes("node")) {
            templatePrompts = [
                `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${nodebasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`,
            ];
            uiPrompts = [nodebasePrompt];
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

    // --- Inject react/node base prompt for NVIDIA ---
    if (provider === "nvidia") {
        // Try to infer project type from the latest user message or fallback to react
        let projectType = "react";
    const lastUserMsg = messages.slice().reverse().find((m: any) => m.role === "user");
        if (lastUserMsg && /node(\b|js|\.js)/i.test(lastUserMsg.content)) {
            projectType = "node";
        }
        // Import base prompts
        const { basePrompt: reactbasePrompt } = await import("./default/react.js");
        const { basePrompt: nodebasePrompt } = await import("./default/node.js");
        const basePrompt = projectType === "node" ? nodebasePrompt : reactbasePrompt;
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
                max_tokens: 8000,
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
                if (useStreaming) {
                    const completion = await openai.chat.completions.create({
                        model: "qwen/qwen3-coder-480b-a35b-instruct",
                        messages: formattedMessages,
                        temperature: 0.7,
                        top_p: 0.8,
                        max_tokens: 4096,
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
                        max_tokens: 10000
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
app.listen(3000);

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


