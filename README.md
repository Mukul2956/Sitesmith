# SiteSmith

**AI-Powered Web Development IDE**

Transform your ideas into functional web applications through natural language conversations with AI. SiteSmith provides a complete development environment that generates, builds, and deploys applications directly in your browser.

## Features

- **Multiple AI Provider Support**: Choose from various AI providers including NVIDIA API, Claude AI, and more
- **Project Management**: Save, organize, and manage your projects with MongoDB persistence
- **Live Development Environment**: Full-featured IDE with Monaco editor, terminal, and file explorer  
- **Instant Preview**: See your applications running live with WebContainer integration
- **Full-Stack Support**: Build both frontend and backend applications seamlessly
- **No Setup Required**: Everything runs in your browser - no local installation needed
- **Advanced Code Generation**: Powered by state-of-the-art language models for superior code understanding

## Getting Started

### Prerequisites
- Node.js 18+ 
- **AI Provider Keys** (choose from available providers):
  - NVIDIA API key (free tier available)
  - Anthropic Claude API key (premium)
  - Additional providers supported - see AI Provider Options below
- **MongoDB Atlas** (optional) - For project persistence and management

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/debashish17/Sitesmith.git
   cd Sitesmith
   ```

2. **Install dependencies**
   ```bash
   # Backend
   cd backend && npm install
   
   # Frontend  
   cd ../frontend && npm install
   ```

3. **Configure environment**
   ```bash
   # Create .env file in backend directory
   cp backend/.env.example backend/.env
   
   # Configure your preferred AI provider:
   # Set AI_PROVIDER to your chosen provider (nvidia, claude, etc.)
   # Add the corresponding API key for your selected provider
   # See AI Provider Options section for detailed setup
   
   # Optional: Add MongoDB URI for project persistence
   # MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sitesmith
   ```

4. **Start the application**
   ```bash
   # Terminal 1 - Backend (port 3000)
   cd backend && npm run dev
   
   # Terminal 2 - Frontend (port 5173)
   cd frontend && npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173`

## AI Provider Options

SiteSmith supports multiple AI providers to give you flexibility in choosing the best model for your needs:

### Currently Supported Providers

#### NVIDIA API
- **Model**: Qwen3-Coder-480B-Instruct  
- **Cost**: Free tier available with rate limits
- **Best for**: Learning, experimentation, and personal projects
- **Setup**: Get API key from [build.nvidia.com](https://build.nvidia.com/)

#### Claude AI (Anthropic)
- **Model**: Claude Sonnet 3.5
- **Cost**: Pay-per-use API charges
- **Best for**: Production applications and complex projects  
- **Setup**: Requires Anthropic API key with billing

### Adding More Providers

SiteSmith is designed with an extensible architecture that makes it easy to integrate additional AI providers. Future supported providers may include:
- OpenAI GPT models
- Google Gemini
- Cohere Command
- Local models via Ollama
- Custom API endpoints

*Want to request a specific provider? [Open an issue](https://github.com/debashish17/Sitesmith/issues) on our GitHub repository.*

## Project Management

- **Auto-Save**: Projects are automatically saved to MongoDB
- **Project History**: Track all changes and conversation history
- **Organization**: Filter projects by status (active, completed, archived)
- **Collaboration**: Share project URLs with team members
- **Backup**: All code, files, and AI conversations are preserved

## How It Works

1. **Choose Your AI Provider**: Select from multiple supported AI providers based on your needs
2. **Describe Your Project**: Tell the AI what you want to build in natural language
3. **Watch It Generate**: AI creates the complete application structure and code
4. **Live Development**: Edit code with full IDE features and see instant previews
5. **Save & Manage**: Projects are automatically saved to MongoDB for future access
6. **Deploy Instantly**: Applications run directly in the browser via WebContainer

## Technology Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript
- **AI Providers**: 
  - Multiple provider support (NVIDIA, Claude, and more)
  - Extensible architecture for adding new AI services
  - Provider-specific optimizations and model selection
- **Database**: MongoDB Atlas for project persistence
- **Runtime**: WebContainer for browser-based execution
- **Editor**: Monaco Editor (VS Code engine)

## Use Cases

- **Rapid prototyping and MVP development** with flexible AI provider options
- **Learning web development concepts** with access to different AI models
- **Code generation and boilerplate creation** using cutting-edge language models
- **Educational coding environment** with project history and management
- **Quick proof-of-concept applications** with persistent project storage
- **Team collaboration** with shareable project links and version history
- **Cost optimization** by choosing the most suitable AI provider for each project

## Contributing

We welcome contributions! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Links

- [Repository](https://github.com/debashish17/Sitesmith)
- [Issues](https://github.com/debashish17/Sitesmith/issues)

---

Built for developers who love AI-powered productivity
