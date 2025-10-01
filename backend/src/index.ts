import dotenv from "dotenv";
dotenv.config();

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { getSystemPrompt,BASE_PROMPT } from "./prompts.js";
import type { TextBlock } from "@anthropic-ai/sdk/resources";
import { basePrompt as nodebasePrompt } from "./default/node.js";
import { basePrompt as reactbasePrompt } from "./default/react.js";
import fs from "fs";
import cors from "cors";


const app=express();
const anthropic = new Anthropic();

app.use(cors())
app.use(express.json())
app.post("/template",async (req,res) =>{
    const prompt=req.body.prompt;
    console.log('Received prompt:', prompt);
    
    try {
        const response = await anthropic.messages.create({
            messages: [{
                role: 'user', content: prompt
            }],
            model: "claude-sonnet-4-5",
            max_tokens: 200,
            system: "Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra"
        });
        
        const answer = (response.content[0] as TextBlock).text.trim().toLowerCase();
        console.log('Claude response:', answer);
        
        if(answer.includes('react')) {
            console.log('Returning react template');
            res.json({
                prompts: [BASE_PROMPT, `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactbasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
                uiprompts: [reactbasePrompt]
            });
            return;
        }
        
        if(answer.includes('node')) {
            console.log('Returning node template');
            res.json({
                prompts: [`Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${nodebasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
                uiprompts: [nodebasePrompt]
            });
            return;
        }
        
        // Default to react if unclear
        console.log('Unclear response, defaulting to react');
        res.json({
            prompts: [BASE_PROMPT, `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactbasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
            uiprompts: [reactbasePrompt]
        });
        
    } catch (error) {
        console.error('Error calling Claude API:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ message: "Error processing request", error: errorMessage });
    }
});

app.post("/chat", async (req, res) => {
    const messages = req.body.messages;
    const response = await anthropic.messages.create({
        messages: messages,
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        system: getSystemPrompt()
    })

    console.log(response);

    res.json({
        response: (response.content[0] as TextBlock)?.text
    });
})
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


